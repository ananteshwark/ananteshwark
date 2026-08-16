"""Helpers for full-text search over extracted document text."""


def make_snippet(text: str | None, query: str | None, radius: int = 100) -> str | None:
    """Return a short excerpt of `text` around the first match of `query`,
    with ellipses where truncated. None if there's no match."""
    if not text or not query:
        return None
    lowered = text.lower()
    q = query.lower().strip()
    idx = lowered.find(q)
    if idx < 0:
        return None
    start = max(0, idx - radius)
    end = min(len(text), idx + len(q) + radius)
    excerpt = text[start:end].strip()
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(text) else ""
    return f"{prefix}{excerpt}{suffix}"
