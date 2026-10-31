"""Tests for `core.keypoints` — pure helpers only.

Only `_split_sentences` is exercised: the rest of the module needs the
sentence-transformers model on disk, which would slow the suite from <1s to
many seconds and require network access on first run. Embedding-quality and
MMR diversity are better validated with offline integration tests, not units.
"""

from __future__ import annotations

import pytest

from core import keypoints as kp


# ─── _split_sentences ────────────────────────────────────────────────────────


def test_split_sentences_basic():
    # Each sentence is intentionally >= KEYPOINTS_MIN_WORDS (8) so none are dropped.
    text = (
        "The technology market is heating up dramatically across multiple sectors. "
        "Investors are increasingly concerned about persistent inflation eroding returns. "
        "Growth across emerging market regions slowed noticeably during the last quarter."
    )
    sentences = kp._split_sentences(text)
    assert len(sentences) == 3
    assert sentences[0].startswith("The technology market")


def test_split_sentences_protects_abbreviations():
    # "U.S." and "e.g." must NOT split mid-sentence.
    text = (
        "Mr. Smith said the U.S. market remains volatile, e.g. tech stocks dipped sharply. "
        "He noted that inflation continues to weigh on consumer confidence."
    )
    sentences = kp._split_sentences(text)
    # If abbrev protection failed we'd see >2 sentences.
    assert len(sentences) == 2
    assert "U.S." in sentences[0]
    assert "e.g." in sentences[0]


def test_split_sentences_drops_too_short_or_too_long():
    # < KEYPOINTS_MIN_WORDS = dropped; > KEYPOINTS_MAX_WORDS = dropped.
    short = "Yes. No. Maybe. Quite possibly."  # all under min words
    long_one = "This sentence is intentionally written to be very long " * 20 + "."
    text = short + " " + long_one
    sentences = kp._split_sentences(text)
    # Every kept sentence must be in [MIN_WORDS, MAX_WORDS] range.
    for s in sentences:
        n = len(s.split())
        assert kp.KEYPOINTS_MIN_WORDS <= n <= kp.KEYPOINTS_MAX_WORDS


def test_split_sentences_empty_input():
    assert kp._split_sentences("") == []
    assert kp._split_sentences("   ") == []
    assert kp._split_sentences(None) == []
