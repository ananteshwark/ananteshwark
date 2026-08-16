"""Text embeddings with pluggable providers (G1).

Three providers, chosen by the ``embedding_provider`` setting:

``concept`` (default)
    Domain-aware: maps contract wording onto canonical concept tokens via
    ``legal_lexicon`` before hashing, so paraphrases converge. Pure Python, no
    dependencies — the air-gapped default.
``hashing``
    The original character-n-gram hashing vector. Kept for compatibility and as
    the last-resort fallback; it cannot match a paraphrase.
``sentence_transformers``
    A real neural encoder, when the site can afford the dependency and has the
    model on disk. Falls back to ``concept`` if unavailable.

Vectors carry a ``version`` so a provider change can be detected and the index
rebuilt rather than silently mixing incompatible spaces.
"""
from __future__ import annotations

import hashlib
import logging
import math
import re
from collections import Counter

log = logging.getLogger(__name__)

# The concept provider splits the vector into two independently normalized
# channels — see embed_concept. The total stays 256 so an existing pgvector
# column keeps its declared width.
CONCEPT_DIM = 192
GRAM_DIM = 64
DIM = CONCEPT_DIM + GRAM_DIM

# Squares sum to 1, so a concatenated unit vector stays unit length and the
# cosine reads as 0.76 * semantic + 0.24 * lexical.
SEMANTIC_W = 0.87
LEXICAL_W = math.sqrt(1.0 - SEMANTIC_W ** 2)

# How much a concept token outweighs an ordinary word of the same frequency.
CONCEPT_BOOST = 2.0

# Function words carry no retrieval signal but appear in every contract, so in
# the semantic channel they only add a similarity floor between unrelated
# documents. "shall" is here because normalize() folds will/must onto it.
_STOP = frozenset("""
a an the and or of to in for on by with as at from into upon under
is are was were be been being this that these those it its such which who whom
any all each other same herein hereof hereto thereof therein
shall may not no nor if then than there so but do does done
""".split())

# Bump when a provider's output space changes so stale vectors are re-indexed.
# concept: 2 = single hashed bag, 4 = two-channel (see embed_concept).
EMBEDDING_VERSIONS = {"hashing": 1, "concept": 4, "sentence_transformers": 3}

_st_model = None
_st_failed = False


def _tokens_hashing(text: str) -> list[str]:
    norm = re.sub(r"\s+", " ", (text or "").lower()).strip()
    words = re.findall(r"[a-z0-9]+", norm)
    grams = [norm[i:i + 3] for i in range(max(0, len(norm) - 2))]
    return words + grams


def _hash_weighted(weights: dict[str, float], dim: int) -> list[float]:
    """Signed feature hashing of weighted tokens, L2-normalized. The sign bit
    makes collisions cancel in expectation instead of always adding, which keeps
    an unrelated document from inheriting similarity by accident."""
    vec = [0.0] * dim
    for tok, w in weights.items():
        h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
        sign = 1.0 if (h >> 8) & 1 else -1.0
        vec[h % dim] += sign * w
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0:
        return vec
    return [v / norm for v in vec]


def _hash_tokens(tokens: list[str], dim: int = DIM) -> list[float]:
    counts = Counter(tokens)
    return _hash_weighted({t: float(n) for t, n in counts.items()}, dim)


def embed_hashing(text: str) -> list[float]:
    return _hash_tokens(_tokens_hashing(text))


def _sublinear(counts: Counter) -> dict[str, float]:
    """1 + log(tf): a term repeated fifty times is worth about five mentions,
    not fifty. Without this a boilerplate word repeated through a long contract
    dominates the vector."""
    return {t: 1.0 + math.log(n) for t, n in counts.items()}


def embed_concept(text: str) -> list[float]:
    """Concept-expanded embedding: domain phrases become shared tokens, so
    "shall indemnify" and "will hold harmless" land close together.

    The vector is two channels, each normalized on its own and then weighted:

    * semantic — normalized words plus boosted ``concept_*`` tokens;
    * lexical — character trigrams, so near-identical wording still wins.

    They are kept apart because hashing both into one bag let length decide the
    outcome: a clause carries ~6 concept tokens against ~100 trigrams, so after
    a shared normalization the trigrams set the score. Measured on a paraphrase
    ("hold the Customer harmless") against unrelated text for the query
    "indemnity obligations", the single-bag form scored 0.135 vs 0.130 — inside
    the noise, and the unrelated document won outright 13% of the time on the
    hash draw alone. Split, the same pair scores about 0.30 vs 0.02.
    """
    from .legal_lexicon import expand, normalize
    tokens = expand(text)
    if not tokens:
        return [0.0] * DIM

    semantic = _sublinear(Counter(t for t in tokens if t not in _STOP))
    for tok in semantic:
        if tok.startswith("concept_"):
            semantic[tok] *= CONCEPT_BOOST

    norm = normalize(text)
    lexical = _sublinear(Counter(norm[i:i + 3] for i in range(max(0, len(norm) - 2))))

    return ([SEMANTIC_W * v for v in _hash_weighted(semantic, CONCEPT_DIM)]
            + [LEXICAL_W * v for v in _hash_weighted(lexical, GRAM_DIM)])


def _load_sentence_transformer(model_name: str):
    global _st_model, _st_failed
    if _st_model is not None or _st_failed:
        return _st_model
    try:
        from sentence_transformers import SentenceTransformer
        _st_model = SentenceTransformer(model_name)
    except Exception:
        log.warning("sentence-transformers unavailable; falling back to the concept provider")
        _st_failed = True
        _st_model = None
    return _st_model


def embed_sentence_transformer(text: str, model_name: str) -> list[float] | None:
    model = _load_sentence_transformer(model_name)
    if model is None:
        return None
    try:
        vec = model.encode(text or "", normalize_embeddings=True)
        return [float(x) for x in vec]
    except Exception:
        log.exception("sentence-transformer encode failed")
        return None


def active_provider(db=None) -> str:
    if db is None:
        return "concept"
    try:
        from .settings_store import get_setting
        return (get_setting(db, "embedding_provider") or "concept").strip() or "concept"
    except Exception:
        return "concept"


def embedding_version(db=None) -> int:
    return EMBEDDING_VERSIONS.get(active_provider(db), 0)


def embed(text: str, db=None) -> list[float]:
    """Embed with the configured provider. `db` is optional so the function stays
    usable from contexts without a session (tests, offline tools)."""
    provider = active_provider(db)
    if provider == "hashing":
        return embed_hashing(text)
    if provider == "sentence_transformers":
        from .settings_store import get_setting
        name = (get_setting(db, "embedding_model") if db else "") or "all-MiniLM-L6-v2"
        vec = embed_sentence_transformer(text, name)
        if vec is not None:
            return vec
        # fall through to the concept provider rather than returning nothing
    return embed_concept(text)


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b))


def cluster(items: list[tuple[int, str]], threshold: float = 0.82) -> list[list[int]]:
    """Greedy clustering of (id, text) by cosine similarity. Returns lists of ids;
    singletons are omitted by the caller if desired."""
    vectors = {i: embed_hashing(t) for i, t in items}
    ids = [i for i, _ in items]
    assigned: set[int] = set()
    clusters: list[list[int]] = []
    for i in ids:
        if i in assigned:
            continue
        group = [i]
        assigned.add(i)
        for j in ids:
            if j in assigned:
                continue
            if cosine(vectors[i], vectors[j]) >= threshold:
                group.append(j)
                assigned.add(j)
        clusters.append(group)
    return clusters
