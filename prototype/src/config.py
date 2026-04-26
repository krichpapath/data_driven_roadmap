# config.py — single source of truth for the entire pipeline
# Edit values here; nothing else needs to change.

# ── PESTLE zero-shot classifier ───────────────────────────────────────────────
PESTLE_MODEL = "facebook/bart-large-mnli"

PESTLE_LABELS = [
    "Political",
    "Economic",
    "Social",
    "Technological",
    "Legal",
    "Environmental",
]

# ── Sentiment model per PESTLE driver ─────────────────────────────────────────
# Maps each PESTLE label → HuggingFace model + how to read its output labels.
# Add "label_map" only when the model uses non-standard label names.
PESTLE_MODELS = {
    "Political": {
        "model_id":  "cardiffnlp/twitter-roberta-base-sentiment-latest",
        "max_length": 512,
    },
    "Economic": {
        "model_id":  "ProsusAI/finbert",
        "max_length": 512,
        "label_map": {"positive": "positive", "negative": "negative", "neutral": "neutral"},
    },
    "Social": {
        "model_id":  "cardiffnlp/twitter-roberta-base-sentiment-latest",
        "max_length": 512,
    },
    "Technological": {
        "model_id":  "cardiffnlp/twitter-roberta-base-sentiment-latest",
        "max_length": 512,
    },
    "Legal": {
        "model_id":  "cardiffnlp/twitter-roberta-base-sentiment-latest",
        "max_length": 512,
    },
    "Environmental": {
        "model_id":  "cardiffnlp/twitter-roberta-base-sentiment-latest",
        "max_length": 512,
    },
}

FALLBACK_SENTIMENT_MODEL = "cardiffnlp/twitter-roberta-base-sentiment-latest"

# ── Key-point extraction ──────────────────────────────────────────────────────
KEYPOINTS_MIN = 3
KEYPOINTS_MAX = 7

# ── DDRM impact scoring ───────────────────────────────────────────────────────

# Per-PESTLE tolerance bands (τ_low, τ_high) for Step 2 discretization.
# A key point with magnitude M is:
#   x=0 (minor)    if M < τ_low
#   x=1 (moderate) if τ_low ≤ M < τ_high
#   x=2 (major)    if M ≥ τ_high
TOLERANCE_BANDS = {
    "Political":     {"low": 0.30, "high": 0.60},
    "Economic":      {"low": 0.25, "high": 0.55},
    "Social":        {"low": 0.30, "high": 0.60},
    "Technological": {"low": 0.25, "high": 0.55},
    "Legal":         {"low": 0.30, "high": 0.60},
    "Environmental": {"low": 0.25, "high": 0.55},
    "default":       {"low": 0.30, "high": 0.60},
}

# Base driver weights W_i (used in Step 4).
# These are normalized over ACTIVE drivers only at runtime.
PESTLE_WEIGHTS = {
    "Political":     0.20,
    "Economic":      0.20,
    "Social":        0.15,
    "Technological": 0.20,
    "Legal":         0.15,
    "Environmental": 0.10,
}

# Verdict thresholds (applied to severity = STRM/2, range 0..1).
DDRM_THRESHOLDS = {
    "adjust": 0.35,   # Maintain below this
    "revise": 0.65,   # Revise at or above this
}
