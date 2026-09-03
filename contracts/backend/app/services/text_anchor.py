"""Locate a quoted snippet inside the document it came from.

The contract detail page highlights risky clauses inline by finding each flagged
snippet in the document text. That worked for the rule-based flags, which are cut
from the text verbatim, and failed for the AI-suggested ones: a model quotes a
clause with its own whitespace — newlines re-flowed into spaces, indentation
dropped — so an exact substring search finds nothing. The risk was listed under
the document and never highlighted in it, which reads as the analysis being
wrong rather than the anchoring being wrong.

Three passes, cheapest first:

1. exact substring;
2. whitespace- and case-insensitive, mapping back to original offsets;
3. fuzzy alignment, for a quote that paraphrases or elides ("… and all claims").

A snippet that still cannot be placed is reported as unlocatable rather than
silently dropped — a risk the reader cannot see in context is worth saying out
loud.
"""
from __future__ import annotations

# Below this alignment score a "match" is a coincidence, not the clause.
MIN_FUZZY_SCORE = 75.0

# Fuzzy alignment is O(n*m); a whole contract against a long quote is not worth
# the wait, and a snippet that long is a section, not a clause.
MAX_FUZZY_CHARS = 200_000


def _normalize(text: str) -> tuple[str, list[int]]:
    """Lower-cased text with runs of whitespace collapsed to one space, plus a
    map from each normalized position back to its offset in the original."""
    out: list[str] = []
    index: list[int] = []
    prev_space = True          # leading whitespace is dropped, not kept
    for i, ch in enumerate(text):
        if ch.isspace():
            if prev_space:
                continue
            out.append(" ")
            index.append(i)
            prev_space = True
        else:
            out.append(ch.lower())
            index.append(i)
            prev_space = False
    return "".join(out), index


def _span_back(index: list[int], text_len: int, start: int, end: int) -> tuple[int, int]:
    """Translate a span in normalized coordinates back to the original text."""
    if not index:
        return 0, 0
    start = max(0, min(start, len(index) - 1))
    end = max(start + 1, min(end, len(index)))
    orig_start = index[start]
    # The end maps to the character after the last matched one.
    orig_end = index[end - 1] + 1 if end - 1 < len(index) else text_len
    return orig_start, min(orig_end, text_len)


def locate(text: str, snippet: str, min_score: float = MIN_FUZZY_SCORE) -> tuple[int, int] | None:
    """Character span of `snippet` within `text`, or None if it isn't there."""
    if not text or not snippet:
        return None

    exact = text.find(snippet)
    if exact >= 0:
        return exact, exact + len(snippet)

    norm_text, index = _normalize(text)
    norm_snip, _ = _normalize(snippet)
    if not norm_snip:
        return None

    hit = norm_text.find(norm_snip)
    if hit >= 0:
        return _span_back(index, len(text), hit, hit + len(norm_snip))

    # A quote that elides its middle ("shall indemnify … from all claims") scores
    # around 65 against the clause it came from — and unrelated contract language
    # scores 47-58, so no cutoff separates them. Rather than lower the bar and
    # start highlighting the wrong clause, anchor the longest intact fragment.
    fragment = _longest_fragment(snippet)
    if fragment:
        norm_frag, _ = _normalize(fragment)
        hit = norm_text.find(norm_frag)
        if hit >= 0:
            return _span_back(index, len(text), hit, hit + len(norm_frag))

    if len(norm_text) > MAX_FUZZY_CHARS:
        return None
    try:
        from rapidfuzz import fuzz
        align = fuzz.partial_ratio_alignment(norm_snip, norm_text, score_cutoff=min_score)
    except Exception:
        return None
    if align is None or align.score < min_score:
        return None
    return _span_back(index, len(text), align.dest_start, align.dest_end)


# Enough characters to be a clause fragment rather than a common phrase.
MIN_FRAGMENT_CHARS = 20


def _longest_fragment(snippet: str) -> str | None:
    """The longest run of a quote that an ellipsis has not interrupted."""
    import re
    parts = [p.strip(" \t\n\r-–—") for p in re.split(r"\.{3}|…|\s[-–—]\s", snippet)]
    parts = [p for p in parts if len(p) >= MIN_FRAGMENT_CHARS]
    if not parts:
        return None
    longest = max(parts, key=len)
    return longest if len(longest) < len(snippet.strip()) else None


def anchor_all(text: str, items: list[dict], key: str = "text") -> tuple[list[dict], int]:
    """Attach a `start`/`end` span to each item that can be placed in `text`.

    Returns the annotated items and how many could not be located. Items keep
    their order; anchored ones gain `start`, `end` and `anchor` (how it matched).
    """
    anchored: list[dict] = []
    missing = 0
    for item in items:
        span = locate(text, (item.get(key) or "").strip())
        out = dict(item)
        if span is None:
            out["start"] = out["end"] = None
            missing += 1
        else:
            out["start"], out["end"] = span
            # Quote the document itself, so the highlight and the listed text agree.
            out["matched_text"] = text[span[0]:span[1]]
        anchored.append(out)
    return anchored, missing


def merge_spans(items: list[dict]) -> list[dict]:
    """Drop items whose span is wholly inside another's, and trim partial
    overlaps, so a document can be rendered as one flat run of segments.

    The page previously skipped any range starting before the previous one
    ended, which silently discarded the second of two overlapping risks.
    Trimming keeps both visible.
    """
    placed = sorted((i for i in items if i.get("start") is not None),
                    key=lambda i: (i["start"], -(i["end"] - i["start"])))
    out: list[dict] = []
    for item in placed:
        if out and item["start"] < out[-1]["end"]:
            if item["end"] <= out[-1]["end"]:
                continue                      # fully covered by the previous span
            item = dict(item, start=out[-1]["end"])   # trim to what is still free
        out.append(item)
    return out
