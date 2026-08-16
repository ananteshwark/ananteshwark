"""Vendor name normalization and fuzzy matching."""
import re

from rapidfuzz import fuzz

# Corporate suffixes ignored when comparing vendor names
_SUFFIXES = [
    "private limited", "pvt ltd", "pvt. ltd.", "pvt. ltd", "pvt ltd.",
    "public limited", "limited", "ltd", "llp", "llc", "inc", "incorporated",
    "corp", "corporation", "co", "company", "gmbh", "sa", "plc", "pte ltd", "pte",
]

_SUFFIX_RE = re.compile(
    r"\b(" + "|".join(re.escape(s) for s in sorted(_SUFFIXES, key=len, reverse=True)) + r")\b\.?",
    re.IGNORECASE,
)


def normalize_vendor_name(name: str | None) -> str:
    """Lowercase, strip punctuation and corporate suffixes like Pvt Ltd / LLP / Inc."""
    if not name:
        return ""
    text = name.lower().strip()
    text = re.sub(r"[.,&()\-_/]", " ", text)
    text = _SUFFIX_RE.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def vendor_similarity(name_a: str | None, name_b: str | None) -> float:
    """Token-set ratio (0-100) between normalized vendor names."""
    a, b = normalize_vendor_name(name_a), normalize_vendor_name(name_b)
    if not a or not b:
        return 0.0
    return fuzz.token_set_ratio(a, b)


def is_same_vendor(name_a: str | None, name_b: str | None, threshold: float = 90.0) -> bool:
    return vendor_similarity(name_a, name_b) >= threshold
