"""Append-only roadmap history in SQLite: the durable copy of the browser's change log."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "history.sqlite3"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS history_events (
  event_id TEXT PRIMARY KEY,
  roadmap_id TEXT NOT NULL,
  item_id TEXT,
  item_name TEXT,
  event_type TEXT,
  origin_type TEXT,
  actor_id TEXT,
  actor_name TEXT,
  timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  group_key TEXT NOT NULL,
  fields TEXT NOT NULL,
  important INTEGER NOT NULL,
  search_text TEXT NOT NULL,
  body TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_history_roadmap_time ON history_events (roadmap_id, timestamp);
"""


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(_SCHEMA)
    return conn


def group_key(event: Dict[str, Any]) -> str:
    # Only Advisor Expert events group, and only by a recorded run or operation id; never by timestamp.
    if event.get("origin_type") == "advisor":
        return event.get("advisor_run_id") or event.get("operation_id") or event["event_id"]
    return event["event_id"]


def add_events(conn: sqlite3.Connection, roadmap_id: str, events: Iterable[Dict[str, Any]]) -> int:
    """Insert events; a repeated event_id (retry, second tab) is ignored. Returns how many were new."""
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for e in events:
        body = {**e, "roadmap_id": roadmap_id, "recorded_at": now}
        rows.append((e["event_id"], roadmap_id, e.get("item_id"), e.get("item_name_snapshot"), e.get("event_type"),
                     e.get("origin_type") or "unknown", e.get("actor_id"), e.get("actor_display_name"), e["timestamp"], now,
                     group_key(e), "," + ",".join(e.get("fields") or []) + ",", 1 if e.get("important") else 0,
                     (e.get("search_text") or "").lower(), json.dumps(body, ensure_ascii=False)))
    with conn:
        before = conn.total_changes
        conn.executemany("INSERT OR IGNORE INTO history_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", rows)
        return conn.total_changes - before


def _where(roadmap_id: str, f: Dict[str, Any]):
    sql, args = ["roadmap_id = ?"], [roadmap_id]
    for key, column in (("item_id", "item_id"), ("event_type", "event_type"), ("origin_type", "origin_type"), ("actor_id", "actor_id")):
        if f.get(key):
            sql.append(f"{column} = ?"); args.append(f[key])
    if f.get("field"):
        sql.append("fields LIKE ?"); args.append(f"%,{f['field']},%")
    if f.get("important"):
        sql.append("important = 1")
    if f.get("since"):
        sql.append("timestamp >= ?"); args.append(f["since"])
    if f.get("until"):
        sql.append("timestamp < ?"); args.append(f["until"])
    if f.get("q"):
        sql.append("instr(search_text, ?) > 0"); args.append(f["q"].lower())
    return " AND ".join(sql), args


def query(conn: sqlite3.Connection, roadmap_id: str, filters: Dict[str, Any], offset: int = 0, limit: int = 50) -> Dict[str, Any]:
    """One page of groups (an Advisor Expert run, or a single event), newest group first unless sort='asc'.
    limit=0 returns every matching group (exports)."""
    where, args = _where(roadmap_id, filters)
    order = "ASC" if filters.get("sort") == "asc" else "DESC"
    page = "" if limit == 0 else f" LIMIT {int(limit)} OFFSET {int(offset)}"
    agg = "MIN" if order == "ASC" else "MAX"
    keys = [r[0] for r in conn.execute(
        f"SELECT group_key, {agg}(timestamp) AS t FROM history_events WHERE {where} GROUP BY group_key ORDER BY t {order}, group_key{page}", args)]
    groups: Dict[str, List[Dict[str, Any]]] = {k: [] for k in keys}
    if keys:
        marks = ",".join("?" * len(keys))
        for key, body in conn.execute(
                f"SELECT group_key, body FROM history_events WHERE {where} AND group_key IN ({marks}) ORDER BY timestamp {order}, event_id",
                [*args, *keys]):
            groups[key].append(json.loads(body))
    total_events, total_groups = conn.execute(
        f"SELECT COUNT(*), COUNT(DISTINCT group_key) FROM history_events WHERE {where}", args).fetchone()
    # Filter choices cover the whole roadmap, not just this page; the latest name wins for renamed items.
    items = conn.execute("SELECT item_id, item_name FROM history_events h WHERE roadmap_id = ? AND timestamp = "
                         "(SELECT MAX(timestamp) FROM history_events WHERE roadmap_id = h.roadmap_id AND item_id = h.item_id) "
                         "GROUP BY item_id ORDER BY item_name", [roadmap_id]).fetchall()
    actors = conn.execute("SELECT actor_id, MAX(actor_name) FROM history_events WHERE roadmap_id = ? AND actor_id IS NOT NULL "
                          "GROUP BY actor_id", [roadmap_id]).fetchall()
    return {"total_events": total_events, "total_groups": total_groups,
            "groups": [{"key": k, "events": groups[k]} for k in keys],
            "items": [list(r) for r in items], "actors": [list(r) for r in actors]}


def delete_roadmap(conn: sqlite3.Connection, roadmap_id: str) -> int:
    with conn:
        return conn.execute("DELETE FROM history_events WHERE roadmap_id = ?", (roadmap_id,)).rowcount
