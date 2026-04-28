# config.py — single source of truth for the entire pipeline
# Edit values here; nothing else needs to change.

# ── PESTLE zero-shot classifier ───────────────────────────────────────────────
# Model: MoritzLaurer/deberta-v3-base-zeroshot-v2.0
# Reason: Laurer et al. 2023, arXiv:2312.17543. F1-macro 0.619 across 28
# classification benchmarks vs 0.497 for bart-large-mnli (+24.5% relative).
# Half the params of the -large variant (~200M vs ~400M) → ~2× faster CPU
# inference per NLI pass; with 6 verbalized PESTLE hypotheses per sentence,
# total pipeline latency drops from ~750-1350ms to ~400-700ms per pick.
# F1 trades 0.676 → 0.619 (-8.4% relative) but still beats BART comfortably.
# License MIT. Same NLI API (drop-in `pipeline("zero-shot-classification", ...)`).
PESTLE_MODEL = "MoritzLaurer/deberta-v3-base-zeroshot-v2.0"

# Single-word PESTLE labels — used as keys in TOLERANCE_BANDS, PESTLE_WEIGHTS,
# PESTLE_MODELS, and as the canonical label returned to the rest of the
# pipeline. The classifier itself is fed VERBALIZED hypotheses (see
# PESTLE_LABEL_VERBALIZED below) for stronger zero-shot accuracy, then the
# verbalized prediction is back-mapped to its short label here.
PESTLE_LABELS = [
    "Political",
    "Economic",
    "Social",
    "Technological",
    "Legal",
    "Environmental",
]

# Verbalized hypotheses fed to the NLI classifier.
# Reason: single-word abstract labels ("Political", "Social") are near-synonyms
# in NLI vector space and yield low confidences (~0.20-0.40 in diagnostic).
# Verbalized phrases give the entailment head richer semantic anchors.
# Pattern recommended on the deberta-v3-zeroshot-v2.0 model card.
# Order MUST match PESTLE_LABELS so the back-mapping is positional.
PESTLE_LABEL_VERBALIZED = [
    "political affairs, government policy, elections, or geopolitics",
    "economic activity, markets, trade, or business finance",
    "social issues, public attitudes, demographics, or culture",
    "technology, scientific research, or engineering innovation",
    "law, regulation, courts, or legal compliance",
    "the environment, climate, ecology, or natural resources",
]

# Hypothesis template — the {} placeholder receives one PESTLE_LABEL_VERBALIZED
# string. Reason: NLI zero-shot accuracy is sensitive to template wording;
# "This news text is primarily about ..." matches the journalistic input
# register and the single-label-classification task framing.
PESTLE_HYPOTHESIS_TEMPLATE = "This news text is primarily about {}."

# Domain-relevance gate for the PESTLE classifier. If the top NLI score is
# below this threshold the pick is labelled "Unclassified" and excluded from
# the impact aggregation (aggregate_by_pestle iterates PESTLE_ORDER, so any
# non-PESTLE label is silently dropped from SKD/STRM math).
# Reason: zero-shot NLI force-routes every sentence to one of six labels even
# when none fit (e.g. movie / sports news → "Social" by default). Without a
# floor, off-domain articles produce active drivers and inflate severity.
# Threshold chosen at the lower edge of the typical in-domain confidence
# distribution observed in tools/diagnostic_output (in-domain top score
# usually ≥0.50; off-domain typically clusters 0.30–0.45).
PESTLE_MIN_CONFIDENCE = 0.45

# ── Sentiment model per PESTLE driver ─────────────────────────────────────────
# Maps each PESTLE label → HuggingFace model + how to read its output labels.
#   label_map         : raw model label → canonical {positive, negative, neutral}
#   neutral_threshold : binary models only — if confidence < threshold, coerce
#                       the prediction to "neutral" (synthesizes a neutral class).
#
# Reason for each pick (proof in CHANGELOG):
#   • SiEBERT (siebert/sentiment-roberta-large-english) — Hartmann et al. 2023,
#     Int. J. of Research in Marketing. 93.2% mean accuracy across 15 datasets
#     (news, reviews, tweets) vs 78.1% for the SST-2 DistilBERT baseline; ~90%
#     leave-one-out (out-of-domain). Binary head dodges Twitter-RoBERTa's
#     news-prose neutral-collapse issue.
#   • FinBERT (ProsusAI/finbert) — Reuters TRC2 + Financial PhraseBank;
#     ≈0.86 macro F1 base model on Financial PhraseBank (arXiv:1908.10063);
#     most-downloaded financial sentiment model on HF; native 3-class.
#   • ClimateBERT-sentiment (climatebert/distilroberta-base-climate-sentiment) —
#     Bingler/Kraus/Leippold/Webersinke 2022/2023, Finance Research Letters.
#     Purpose-built for climate-disclosure tone; labels opportunity / risk /
#     neutral map directly to ±/0. Trained on paragraphs — mitigated by the
#     KEYPOINTS_CONTEXT_WINDOW=1 (3-sentence) bundles fed to the classifier.
PESTLE_MODELS = {
    # Political — formal policy/regulation prose. SiEBERT generalises across
    # news + tweets; Twitter-RoBERTa was tweet-only and went neutral on news.
    "Political": {
        "model_id":  "siebert/sentiment-roberta-large-english",
        "max_length": 512,
        "label_map": {"POSITIVE": "positive", "NEGATIVE": "negative"},
        "neutral_threshold": 0.70,
    },
    # Economic — financial-news register. FinBERT trained on the exact
    # distribution (Reuters + Financial PhraseBank); already 3-class native.
    "Economic": {
        "model_id":  "ProsusAI/finbert",
        "max_length": 512,
        "label_map": {"positive": "positive", "negative": "negative", "neutral": "neutral"},
    },
    # Social — public-opinion / labour / demographics prose. SiEBERT's training
    # mix (Yelp, Amazon, IMDb, Twitter, news) covers this register.
    "Social": {
        "model_id":  "siebert/sentiment-roberta-large-english",
        "max_length": 512,
        "label_map": {"POSITIVE": "positive", "NEGATIVE": "negative"},
        "neutral_threshold": 0.70,
    },
    # Technological — heavy hedging ("could disrupt", "forced to", "unsettled").
    # SiEBERT robust to hedged language; threshold raised to 0.75 to avoid
    # over-confident pos/neg on borderline tech-news prose.
    "Technological": {
        "model_id":  "siebert/sentiment-roberta-large-english",
        "max_length": 512,
        "label_map": {"POSITIVE": "positive", "NEGATIVE": "negative"},
        "neutral_threshold": 0.75,
    },
    # Legal — no peer-reviewed legal-news-sentiment model on HF (LegalBERT-style
    # models predict case outcomes, wrong task). SiEBERT general-purpose
    # fallback; flagged as a known gap for future work.
    "Legal": {
        "model_id":  "siebert/sentiment-roberta-large-english",
        "max_length": 512,
        "label_map": {"POSITIVE": "positive", "NEGATIVE": "negative"},
        "neutral_threshold": 0.70,
    },
    # Environmental — purpose-built ClimateBERT-sentiment (NOT *-detector,
    # which is topic detection only). Native 3-class with the climate-tone
    # axis (opportunity / risk / neutral) the DDRM driver actually needs.
    "Environmental": {
        "model_id":  "climatebert/distilroberta-base-climate-sentiment",
        "max_length": 512,
        "label_map": {"opportunity": "positive", "risk": "negative", "neutral": "neutral"},
    },
}

FALLBACK_SENTIMENT_MODEL = "siebert/sentiment-roberta-large-english"

# ── Key-point extraction ──────────────────────────────────────────────────────
KEYPOINTS_MIN = 3
KEYPOINTS_MAX = 7

# Semantic extractor (sentence-transformers + MMR + PESTLE prior).
# Falls back to TF-IDF if sentence-transformers is unavailable.
KEYPOINTS_EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
KEYPOINTS_ALPHA       = 0.5   # weight: similarity to document centroid (informativeness)
KEYPOINTS_BETA        = 0.4   # weight: max similarity to PESTLE labels (driver relevance)
KEYPOINTS_GAMMA       = 0.1   # weight: length-deviation penalty
KEYPOINTS_MMR_LAMBDA  = 0.7   # MMR balance: 1.0 = pure relevance, 0.0 = pure diversity
KEYPOINTS_MIN_WORDS   = 8
KEYPOINTS_MAX_WORDS   = 60

# Context window: number of neighbour sentences (each side) bundled with each
# pick and forwarded to the PESTLE / sentiment classifiers. Keeps the displayed
# key point short, but lets downstream models see surrounding context.
KEYPOINTS_CONTEXT_WINDOW = 1

# Relevance gain — multiplicative rescale applied to the raw cosine similarity
# returned by `extract_keypoints_rich` before it enters the DDRM magnitude
# formula M = |d| · c · r. Diagnostic showed raw cosine values cluster in
# [0.15, 0.45] for in-domain news (PESTLE labels are single words, sentence
# embeddings are dense), capping magnitude near 0.30 even at confidence ≈ 1.0.
# A gain of 2.0 (clipped to 1.0) maps 0.25 → 0.50, 0.40 → 0.80, lifting
# magnitudes into the τ_low..τ_high band where Step 2 produces meaningful x_ij.
# Engineering knob — does NOT modify the formula chain.
KEYPOINTS_RELEVANCE_GAIN = 1.4

# ── DDRM impact scoring ───────────────────────────────────────────────────────

# Per-PESTLE tolerance bands (τ_low, τ_high) for Step 2 discretization.
# A key point with magnitude M is:
#   x=0 (minor)    if M < τ_low
#   x=1 (moderate) if τ_low ≤ M < τ_high
#   x=2 (major)    if M ≥ τ_high
#
# Recalibrated 2026-04-27 after the relevance-gain rescale and per-driver
# sentiment-model swap. With raw-cosine relevance × gain 2.0 and SiEBERT/
# FinBERT/ClimateBERT confidences typically 0.70–0.99, post-formula
# magnitudes cluster in [0.20, 0.55]. Old τ_low (0.30) was rejecting genuine
# moderate-impact picks. New bands keep boilerplate at x=0 (mag < ~0.18) but
# admit moderate journalistic signal at x=1.
TOLERANCE_BANDS = {
    "Political":     {"low": 0.22, "high": 0.65},
    "Economic":      {"low": 0.22, "high": 0.65},
    "Social":        {"low": 0.22, "high": 0.65},
    "Technological": {"low": 0.22, "high": 0.65},
    "Legal":         {"low": 0.22, "high": 0.65},
    "Environmental": {"low": 0.20, "high": 0.55},  # ClimateBERT confidence skews lower
    "default":       {"low": 0.22, "high": 0.65},
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
