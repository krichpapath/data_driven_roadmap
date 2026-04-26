# keypoints.py — extractive key-point selection with TF-IDF relevance scores

import re
from typing import List, Tuple

from config import KEYPOINTS_MIN, KEYPOINTS_MAX


def _split_sentences(text: str) -> List[str]:
    """Split text into sentences using basic punctuation rules."""
    # Split on . ! ? followed by whitespace or end-of-string
    raw = re.split(r'(?<=[.!?])\s+', text.strip())
    # Keep only sentences long enough to carry meaning (> 30 chars)
    return [s.strip() for s in raw if len(s.strip()) > 30]


def _tfidf_scores(sentences: List[str]) -> List[float]:
    """Score each sentence by its average TF-IDF weight across all words."""
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        import numpy as np

        vec = TfidfVectorizer(stop_words="english")
        matrix = vec.fit_transform(sentences)          # shape: (n_sentences, n_terms)
        scores = matrix.mean(axis=1).A1                # mean tfidf weight per sentence
        return scores.tolist()

    except ImportError:
        # Fallback: score by normalized sentence length (crude but dependency-free)
        lengths = [len(s.split()) for s in sentences]
        max_len = max(lengths) or 1
        return [l / max_len for l in lengths]


def extract_keypoints(text: str, max_points: int = KEYPOINTS_MAX) -> List[Tuple[str, float]]:
    """
    Select the top-N most informative sentences from text.

    Returns a list of (sentence, relevance_weight) tuples.
    relevance_weight is in [0, 1], normalized so the top sentence = 1.0.
    """
    max_points = max(KEYPOINTS_MIN, min(max_points, KEYPOINTS_MAX))

    sentences = _split_sentences(text)

    if not sentences:
        raise ValueError("No usable sentences found in text.")

    # Score every sentence
    raw_scores = _tfidf_scores(sentences)

    # Rank and pick top-N
    ranked = sorted(
        zip(sentences, raw_scores),
        key=lambda pair: pair[1],
        reverse=True,
    )
    top = ranked[:max_points]

    # Normalize relevance weights so the best sentence = 1.0
    max_score = top[0][1] if top[0][1] > 0 else 1.0
    result = [(sent, round(score / max_score, 4)) for sent, score in top]

    # Return in original document order (preserve reading flow)
    sentence_order = {s: i for i, s in enumerate(sentences)}
    result.sort(key=lambda pair: sentence_order.get(pair[0], 0))

    return result
