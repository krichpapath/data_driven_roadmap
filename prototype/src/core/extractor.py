# extractor.py — get clean (title, text) from a URL or raw text

from typing import Tuple


def extract_article(url: str) -> Tuple[str, str]:
    """
    Download and parse a news article from a URL.
    Returns (title, body_text).
    Raises ValueError if the page cannot be fetched or parsed.
    """
    try:
        from newspaper import Article
    except ImportError:
        raise ImportError("Install newspaper3k:  pip install newspaper3k")

    article = Article(url)
    article.download()
    article.parse()

    title = article.title or ""
    text  = article.text  or ""

    if not text.strip():
        raise ValueError(f"Could not extract text from: {url}")

    return title.strip(), text.strip()


def extract_text(raw: str) -> Tuple[str, str]:
    """
    Accept plain text directly.
    Returns ("", cleaned_text) — no title for raw-text mode.
    """
    cleaned = raw.strip()
    if not cleaned:
        raise ValueError("Input text is empty.")
    return "", cleaned
