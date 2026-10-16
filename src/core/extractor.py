# extractor.py — multi-strategy article extraction
#
# Strategy chain (first success wins):
#   1. trafilatura       — best general-purpose, multilingual, handles most news sites
#   2. newspaper3k       — strong on traditional news (BBC, Reuters, etc.)
#   3. readability-lxml  — Mozilla Readability port, robust HTML cleanup
#   4. BeautifulSoup     — last-resort heuristic over <p> tags
#
# All strategies are language-agnostic; trafilatura auto-detects 40+ languages.

from typing import Tuple, Optional
import re
from core.url_fetch import fetch_html

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/122.0 Safari/537.36"
)

MIN_TEXT_LEN = 200  # below this we treat extraction as failed and try next strategy


# ─── strategy 1: trafilatura ──────────────────────────────────────────────────

def _extract_trafilatura(url: str, html: Optional[str] = None) -> Tuple[str, str]:
    import trafilatura
    from trafilatura.settings import use_config

    cfg = use_config()
    cfg.set("DEFAULT", "USER_AGENTS", USER_AGENT)
    cfg.set("DEFAULT", "DOWNLOAD_TIMEOUT", "20")

    downloaded = html
    if not downloaded:
        return "", ""

    text = trafilatura.extract(
        downloaded,
        include_comments=False,
        include_tables=False,
        favor_recall=True,
        config=cfg,
    ) or ""

    title = ""
    meta = trafilatura.extract_metadata(downloaded)
    if meta and meta.title:
        title = meta.title

    return title.strip(), text.strip()


# ─── strategy 2: newspaper3k ──────────────────────────────────────────────────

def _extract_newspaper(url: str, html: str) -> Tuple[str, str]:
    from newspaper import Article, Config

    cfg = Config()
    cfg.browser_user_agent = USER_AGENT
    cfg.request_timeout = 20
    cfg.fetch_images = False

    article = Article(url, config=cfg)
    article.set_html(html)
    article.parse()
    return (article.title or "").strip(), (article.text or "").strip()


# ─── strategy 3: readability-lxml ─────────────────────────────────────────────

def _extract_readability(url: str, html: Optional[str] = None) -> Tuple[str, str]:
    from readability import Document
    from bs4 import BeautifulSoup

    doc = Document(html)
    title = (doc.short_title() or "").strip()
    summary_html = doc.summary()
    text = BeautifulSoup(summary_html, "html.parser").get_text(separator="\n").strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return title, text


# ─── strategy 4: BeautifulSoup heuristic ──────────────────────────────────────

def _extract_bs4(url: str, html: Optional[str] = None) -> Tuple[str, str]:
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

    errors = []

    url, cached_html = fetch_html(url)

    strategies = [
        ("trafilatura",  lambda: _extract_trafilatura(url, cached_html)),
        ("newspaper3k",  lambda: _extract_newspaper(url, cached_html)),
        ("readability",  lambda: _extract_readability(url, cached_html)),
        ("bs4",          lambda: _extract_bs4(url, cached_html)),
    ]

    best: Tuple[str, str] = ("", "")

    for name, fn in strategies:
        try:
            title, text = fn()
        except Exception as exc:
            errors.append(f"{name}: {exc}")
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
