# keypoints.py — semantic extractive selection with PESTLE prior, MMR diversity,
# raw PESTLE-similarity relevance, and context-window output.
#
# Public API:
#     extract_keypoints(text, max_points)
#         -> List[Tuple[sentence, relevance]]                  (legacy 2-tuple)
#
#     extract_keypoints_rich(text, max_points)
#         -> List[Dict{ sentence, relevance, context, composite, position }]
#
# `relevance` is the RAW max cosine similarity between the sentence and the
# closest PESTLE label embedding (clipped to [0, 1]). It reflects driver-
# alignment confidence, not pick rank, so multiple on-topic picks all carry
# meaningful weight downstream.
#
# `context` is the picked sentence plus KEYPOINTS_CONTEXT_WINDOW neighbour
# sentences on each side (preserved in original document order). It is meant
# to be fed to the PESTLE / sentiment classifiers so they see the surrounding
# discourse, while the UI continues to display the bare sentence.
#
# Requires sentence-transformers for DDRM impact scoring. Older versions used
# a TF-IDF fallback, but that rank-normalized score is not driver relevance and
# can overstate impact.

import re
from typing import List, Tuple, Dict, Any

from config import KEYPOINTS_MIN, KEYPOINTS_MAX, PESTLE_LABELS, MODEL_REVISIONS

try:
    from config import PESTLE_LABEL_VERBALIZED
except ImportError:
    PESTLE_LABEL_VERBALIZED = PESTLE_LABELS

# Anchors used for the relevance cosine. Verbalized phrases give MiniLM a
# narrower semantic target than the bare single-word PESTLE labels (which
# attract any cultural/people prose, e.g. movie news → "Social"). Falls
# back to the short labels if the verbalized list is unavailable.
_RELEVANCE_ANCHORS = PESTLE_LABEL_VERBALIZED if PESTLE_LABEL_VERBALIZED else PESTLE_LABELS

try:
    from config import (
        KEYPOINTS_EMBED_MODEL,
        KEYPOINTS_ALPHA,
        KEYPOINTS_BETA,
        KEYPOINTS_GAMMA,
        KEYPOINTS_MMR_LAMBDA,
        KEYPOINTS_MIN_WORDS,
        KEYPOINTS_MAX_WORDS,
    )
except ImportError:
    KEYPOINTS_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
    KEYPOINTS_ALPHA, KEYPOINTS_BETA, KEYPOINTS_GAMMA = 0.5, 0.4, 0.1
    KEYPOINTS_MMR_LAMBDA = 0.7
    KEYPOINTS_MIN_WORDS, KEYPOINTS_MAX_WORDS = 8, 60

try:
    from config import KEYPOINTS_CONTEXT_WINDOW
except ImportError:
    KEYPOINTS_CONTEXT_WINDOW = 1

try:
    from config import KEYPOINTS_RELEVANCE_GAIN
except ImportError:
    KEYPOINTS_RELEVANCE_GAIN = 1.0


def _raise_semantic_required_error(exc: Exception):
    raise RuntimeError(
        "Semantic keypoint model is unavailable or not cached: "
        f"{KEYPOINTS_EMBED_MODEL}. Run once with network access so "
        "SentenceTransformer can download the model, or pre-cache it in this "
        "Python environment, then restart the app. TF-IDF fallback is disabled "
        "for DDRM impact scoring because it can overstate relevance."
    ) from exc


_ABBREVS = (
    "Mr", "Mrs", "Ms", "Dr", "Prof", "Sr", "Jr", "St",
    "U.S", "U.K", "U.S.A", "e.g", "i.e", "vs", "etc",
    "Inc", "Ltd", "Co", "No", "Fig", "Eq", "Ref",
)
_DOT_TOKEN = "<<DOT>>"
_SENT_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'(\[])")


def _protect_abbrevs(text: str) -> str:
    for a in _ABBREVS:
        text = re.sub(rf"\b{re.escape(a)}\.", a + _DOT_TOKEN, text)
    return text


def _restore_abbrevs(text: str) -> str:
    return text.replace(_DOT_TOKEN, ".")


_model_cache: dict = {}


def _split_sentences(text: str) -> List[str]:
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return []
    protected = _protect_abbrevs(text)
    raw = _SENT_END.split(protected)
    out = []
    for s in raw:
        s = _restore_abbrevs(s).strip()
        if not s:
            continue
        n = len(s.split())
        if KEYPOINTS_MIN_WORDS <= n <= KEYPOINTS_MAX_WORDS:
            out.append(s)
    return out


def _get_embedder():
    if "model" not in _model_cache:
        from sentence_transformers import SentenceTransformer
        from core.router import model_load_args
        _model_cache["model"] = SentenceTransformer(
            KEYPOINTS_EMBED_MODEL, revision=MODEL_REVISIONS[KEYPOINTS_EMBED_MODEL], trust_remote_code=False,
            model_kwargs={"dtype": model_load_args()["dtype"]},
        )
    return _model_cache["model"]


def _embed(texts: List[str]):
    import numpy as np
    emb = _get_embedder().encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    return np.asarray(emb)


def _length_penalty(sentence: str) -> float:
    n = len(sentence.split())
    ideal = (KEYPOINTS_MIN_WORDS + KEYPOINTS_MAX_WORDS) / 2.0
    return abs(n - ideal) / ideal


def _score_semantic(sentences: List[str]):
    """Return (composite_scores, sent_emb, raw_pestle_sim_per_sentence)."""
    import numpy as np

    sent_emb = _embed(sentences)
    centroid = sent_emb.mean(axis=0, keepdims=True)
    label_emb = _embed(_RELEVANCE_ANCHORS)

    sim_centroid = (sent_emb @ centroid.T).ravel()
    sim_labels = (sent_emb @ label_emb.T).max(axis=1)
    pen = np.array([_length_penalty(s) for s in sentences])

    composite = (
        KEYPOINTS_ALPHA * sim_centroid
        + KEYPOINTS_BETA * sim_labels
        - KEYPOINTS_GAMMA * pen
    )
    return composite, sent_emb, sim_labels


def _mmr_select(scores, sent_emb, k: int) -> List[int]:
    import numpy as np

    lam = KEYPOINTS_MMR_LAMBDA
    n = len(scores)
    sim = sent_emb @ sent_emb.T

    picked: List[int] = []
    remaining = list(range(n))

    first = int(np.argmax(scores))
    picked.append(first)
    remaining.remove(first)

    while remaining and len(picked) < k:
        best_idx, best_val = remaining[0], -1e18
        for i in remaining:
            redundancy = max(sim[i, j] for j in picked)
            val = lam * scores[i] - (1.0 - lam) * redundancy
            if val > best_val:
                best_val, best_idx = val, i
        picked.append(best_idx)
        remaining.remove(best_idx)
    return picked


def _build_context(sentences: List[str], idx: int, window: int) -> str:
    """Sentence at `idx` plus `window` neighbours each side, joined in order."""
    if window <= 0:
        return sentences[idx]
    lo = max(0, idx - window)
    hi = min(len(sentences), idx + window + 1)
    return " ".join(sentences[lo:hi])


def extract_keypoints_rich(
    text: str,
    max_points: int = KEYPOINTS_MAX,
    context_window: int = None,
) -> List[Dict[str, Any]]:
    """
    Pick the top-N most informative + driver-relevant + diverse sentences and
    return rich records carrying both the bare sentence and its surrounding
    context.

    Each record:
        {
            "sentence":  str    the picked sentence (display)
            "relevance": float  raw max-cos to closest PESTLE label, 0..1
            "context":   str    sentence + neighbours (for classifiers)
            "composite": float  internal composite score (0..1ish, debug only)
            "position":  int    original sentence index
        }
    """
    if context_window is None:
        context_window = KEYPOINTS_CONTEXT_WINDOW

    max_points = max(KEYPOINTS_MIN, min(max_points, KEYPOINTS_MAX))

    sentences = _split_sentences(text)
    if not sentences:
        raise ValueError("No usable sentences found in text.")

    # Score every sentence; if there are more than max_points, narrow via MMR.
    try:
        composite, sent_emb, relevance_per_sent = _score_semantic(sentences)
    except Exception as exc:
        _raise_semantic_required_error(exc)

    if len(sentences) <= max_points:
        picked_idx = list(range(len(sentences)))
    else:
        picked_idx = _mmr_select(composite, sent_emb, max_points)

    gain = float(KEYPOINTS_RELEVANCE_GAIN)
    out: List[Dict[str, Any]] = []
    for i in sorted(picked_idx):
        raw = max(0.0, min(1.0, float(relevance_per_sent[i])))
        rel = max(0.0, min(1.0, raw * gain))
        out.append({
            "sentence":  sentences[i],
            "relevance": round(rel, 4),
            "context":   _build_context(sentences, i, context_window),
            "composite": round(float(composite[i]), 4),
            "position":  i,
        })
    return out


def extract_keypoints(text: str, max_points: int = KEYPOINTS_MAX) -> List[Tuple[str, float]]:
    """
    Legacy 2-tuple API. Kept for backwards compatibility.

    NOTE: as of the A+B upgrade, `relevance` is the raw max-cosine to the
    closest PESTLE label (driver-alignment confidence), not a rank-normalized
    score. Multiple on-topic picks now carry meaningful weight.
    """
    rich = extract_keypoints_rich(text, max_points=max_points)
    return [(item["sentence"], item["relevance"]) for item in rich]
