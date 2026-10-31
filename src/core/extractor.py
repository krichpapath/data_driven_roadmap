# extractor.py — multi-strategy article extraction
#
# Strategy chain (first success wins):
#   1. trafilatura       — best general-purpose, multilingual, handles most news sites
#   2. readability-lxml  — Mozilla Readability port, robust HTML cleanup
#   3. BeautifulSoup     — last-resort heuristic over <p> tags
#
# All strategies are language-agnostic; trafilatura auto-detects 40+ languages.

from typing import Tuple
import re
from core.url_fetch import fetch_html

MIN_TEXT_LEN = 200  # below this we treat extraction as failed and try next strategy


# ─── strategy 1: trafilatura ──────────────────────────────────────────────────

def _extract_trafilatura(html: str) -> Tuple[str, str]:
    import trafilatura
    if not html:
        return "", ""

    text = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=False,
        favor_recall=True,
    ) or ""

    title = ""
    meta = trafilatura.extract_metadata(html)
    if meta and meta.title:
        title = meta.title

    return title.strip(), text.strip()


# ─── strategy 2: readability-lxml ─────────────────────────────────────────────

def _extract_readability(html: str) -> Tuple[str, str]:
    from readability import Document
    from bs4 import BeautifulSoup

    doc = Document(html)
    title = (doc.short_title() or "").strip()
    summary_html = doc.summary()
    text = BeautifulSoup(summary_html, "html.parser").get_text(separator="\n").strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return title, text


# ─── strategy 3: BeautifulSoup heuristic ──────────────────────────────────────

def _extract_bs4(html: str) -> Tuple[str, str]:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")

    # Title
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    og = soup.find("meta", property="og:title")
    if og and og.get("content"):
        title = og["content"].strip()

    # Strip noise
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "form"]):
        tag.decompose()

    # Prefer <article>, then <main>, then body
    container = soup.find("article") or soup.find("main") or soup.body or soup
    paragraphs = [p.get_text(" ", strip=True) for p in container.find_all("p")]
    paragraphs = [p for p in paragraphs if len(p) > 40]  # drop short/nav fragments

    text = "\n\n".join(paragraphs).strip()
    return title, text


# ─── public API ───────────────────────────────────────────────────────────────

def extract_article(url: str) -> Tuple[str, str]:
    """
    Download and parse a news article from a URL.
    Tries multiple extraction strategies in order; returns first usable result.
    Returns (title, body_text). Raises ValueError if all strategies fail.
    """
    url = url.strip()
    if not url:
        raise ValueError("URL is empty.")

    _, cached_html = fetch_html(url)

    best: Tuple[str, str] = ("", "")

    for parse in (_extract_trafilatura, _extract_readability, _extract_bs4):
        try:
            title, text = parse(cached_html)
        except Exception:
            continue

        if text and len(text) >= MIN_TEXT_LEN:
            return title, text

        # Keep longest partial result as fallback
        if len(text) > len(best[1]):
            best = (title, text)

    if best[1]:
        return best  # short but non-empty — better than nothing

    raise ValueError(
        "No readable article text was found. The page may require a login or JavaScript; paste the article text instead."
    )


def extract_text(raw: str) -> Tuple[str, str]:
    """
    Accept plain text directly. Returns ("", cleaned_text).
    """
    cleaned = raw.strip()
    if not cleaned:
        raise ValueError("Input text is empty.")
    return "", cleaned
