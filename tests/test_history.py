from fastapi.testclient import TestClient
from api import history_store, roadmap_api


def event(n, **extra):
    base = {"event_id": f"e{n}", "timestamp": f"2026-10-{1 + n // 1000:02d}T10:{(n // 60) % 60:02d}:{n % 60:02d}.000Z",
            "item_id": f"i{n % 7}", "item_name_snapshot": f"Item {n % 7}", "event_type": "edited", "origin_type": "user",
            "actor_id": "me", "fields": ["bands"], "important": False, "search_text": f"item {n % 7} edited",
            "field_changes": [{"field": "bands", "before": ["b1"], "after": ["b2"]}]}
    return {**base, **extra}


def client(tmp_path, monkeypatch):
    monkeypatch.setattr(history_store, "DB_PATH", tmp_path / "history.sqlite3")
    return TestClient(roadmap_api.app, base_url="http://127.0.0.1")


def test_history_is_durable_idempotent_and_unbounded(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        events = [event(n) for n in range(620)]
        assert c.post("/api/history/rm1/events", json={"events": events[:500]}).json() == {"stored": 500}
        assert c.post("/api/history/rm1/events", json={"events": events[400:]}).json() == {"stored": 120}  # retry overlap ignored
        page = c.get("/api/history/rm1", params={"limit": 50}).json()
        assert page["total_events"] == 620 and len(page["groups"]) == 50
        assert page["groups"][0]["events"][0]["event_id"] == "e619"  # newest first
        assert page["groups"][0]["events"][0]["recorded_at"]  # server time added
        assert page["groups"][0]["events"][0]["field_changes"] == events[619]["field_changes"]  # stored whole
        everything = c.get("/api/history/rm1", params={"limit": 0}).json()
        assert sum(len(g["events"]) for g in everything["groups"]) == 620
        assert c.get("/api/history/other").json()["total_events"] == 0


def test_history_groups_by_run_not_timestamp_and_filters_children(tmp_path, monkeypatch):
    at = "2026-10-27T14:14:00.000Z"
    run_a = [event(n, timestamp=at, origin_type="advisor", advisor_run_id="run_a", fields=["advice"],
                   important=False, search_text="advisor rescope") for n in range(8)]
    run_b = [event(100, timestamp=at, origin_type="advisor", advisor_run_id="run_b", fields=["advice"])]
    users = [event(200, timestamp=at), event(201, timestamp=at, event_type="deleted", important=True, fields=["name", "bands"])]
    with client(tmp_path, monkeypatch) as c:
        c.post("/api/history/rm1/events", json={"events": run_a + run_b + users})
        page = c.get("/api/history/rm1").json()
        assert sorted(len(g["events"]) for g in page["groups"]) == [1, 1, 1, 8]
        assert page["total_groups"] == 4 and page["total_events"] == 11
        only_i3 = c.get("/api/history/rm1", params={"origin_type": "advisor", "item_id": "i3"}).json()
        assert [len(g["events"]) for g in only_i3["groups"]] == [1] and only_i3["groups"][0]["key"] == "run_a"
        important = c.get("/api/history/rm1", params={"important": "true", "field": "name"}).json()
        assert [e["event_id"] for g in important["groups"] for e in g["events"]] == ["e201"]
        assert c.get("/api/history/rm1", params={"q": "RESCOPE"}).json()["total_events"] == 8
        assert c.get("/api/history/rm1", params={"since": "2026-10-28T00:00:00.000Z"}).json()["total_events"] == 0


def test_history_rejects_malformed_events(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        assert c.post("/api/history/rm1/events", json={"events": [{"timestamp": "2026-10-27T00:00:00Z"}]}).status_code == 422
        assert c.post("/api/history/rm1/events", json={"events": [event(1)] * 1001}).status_code == 422


def test_deleting_a_roadmap_removes_only_its_history(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        c.post("/api/history/rm1/events", json={"events": [event(1), event(2)]})
        c.post("/api/history/rm2/events", json={"events": [event(3)]})
        assert c.delete("/api/history/rm1").json() == {"deleted": 2}
        assert c.get("/api/history/rm1").json()["total_events"] == 0
        assert c.get("/api/history/rm2").json()["total_events"] == 1


def test_cors_allows_only_the_local_page(tmp_path, monkeypatch):
    with client(tmp_path, monkeypatch) as c:
        ok = c.get("/api/health", headers={"Origin": "http://127.0.0.1:8000"})
        bad = c.get("/api/health", headers={"Origin": "https://evil.example"})
        assert ok.headers.get("access-control-allow-origin") == "http://127.0.0.1:8000"
        assert "access-control-allow-origin" not in bad.headers
