"""Near-duplicate detection over the document text.

Record-level detection (`duplicates.py`) compares what was *captured*: vendor, PO
number, dates, service. That misses the case people actually hit — the same
document ingested twice, from a different folder or a re-scan, before anyone has
captured anything from it, or with a field mis-keyed so the record comparison
finds nothing in common. It also cannot see that two records with different PO
numbers are word-for-word the same paper.

This compares the documents. The method is shingling: overlapping runs of words,
hashed, reduced to a fixed-size sketch, compared by Jaccard overlap. Deliberately
*not* the semantic embedding — that measures what a contract is about, so every
MSA with an indemnity clause looks alike, and "about the same thing" is not
"the same document".

The sketch is stored per contract so a validation compares small integer arrays
rather than re-reading every contract body in the repository.
"""
from __future__ import annotations

import hashlib
import re

# Words per shingle. Long enough that ordinary legal boilerplate ("the parties
# hereto agree that") does not match by itself; short enough to survive edits.
SHINGLE_WORDS = 7

# Size of the retained sketch. 128 minima estimate Jaccard to within a few
# percent, which is ample for a "look at these two" prompt.
SKETCH_SIZE = 128

# Measured against re-ingestions, renewals, template siblings and unrelated
# paper (see tests/test_document_dupes.py):
#
#   same document, reformatted / a clause dropped   0.88 - 0.97
#   next year's renewal (dates and fees changed)    0.66
#   same template, different vendor and service     0.61
#   unrelated contract                              0.00
#
# 0.80 sits in the gap. It is set for precision because this prompt interrupts
# someone mid-validation: a flag they dismiss twice is a flag they will dismiss
# the third time, when it is right.
#
# What this deliberately does not catch: a re-scan with OCR corruption, which
# breaks every shingle spanning a mangled word and scores 0.30-0.57 — *below* a
# renewal. Sweeping the shingle length from 3 to 7 words never separated the
# two, so there is no threshold that catches noisy re-scans without flagging
# every renewal as a duplicate. Those are left to the record-level check, which
# compares vendor, PO and dates and does not care how the text came out.
SIMILARITY_THRESHOLD = 0.80

_WORD = re.compile(r"[a-z0-9]+")


def _tokens(text: str) -> list[str]:
    return _WORD.findall((text or "").lower())


def sketch(text: str) -> list[int]:
    """Fixed-size fingerprint of a document, or [] if there is too little text."""
    words = _tokens(text)
    if len(words) < SHINGLE_WORDS:
        return []
    hashes = set()
    for i in range(len(words) - SHINGLE_WORDS + 1):
        shingle = " ".join(words[i:i + SHINGLE_WORDS])
        digest = hashlib.blake2b(shingle.encode("utf-8"), digest_size=8).digest()
        hashes.add(int.from_bytes(digest, "big"))
    # The k smallest hashes are a uniform sample of the shingle set, so the
    # overlap of two sketches estimates the overlap of the documents.
    return sorted(hashes)[:SKETCH_SIZE]


def similarity(a, b) -> float:
    """Estimated Jaccard overlap of two documents from their sketches.

    Sketches are decoded on the way in: a database whose column was created as
    TEXT hands back a JSON string, and `set("[123, 456]")` is a set of
    characters, which then cannot be ordered against a set of integers.
    """
    from .json_compat import as_json
    a, b = as_json(a, []), as_json(b, [])
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    # Compare like with like: over the union's smallest hashes, which is the
    # sample both sketches would have kept had they been built together.
    union = sorted(sa | sb)[:SKETCH_SIZE]
    if not union:
        return 0.0
    shared = sum(1 for h in union if h in sa and h in sb)
    return shared / len(union)


def text_fingerprint(text: str) -> str:
    """Identity of the text a sketch was built from, so it can be invalidated."""
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def find_content_duplicates(
    candidate_sketch: list[int],
    others: list[tuple[int, list[int] | None]],
    threshold: float = SIMILARITY_THRESHOLD,
) -> list[tuple[int, float]]:
    """(sr_no, similarity) for each document that looks like the same paper."""
    if not candidate_sketch:
        return []
    hits = []
    for sr_no, other in others:
        score = similarity(candidate_sketch, other)
        if score >= threshold:
            hits.append((sr_no, score))
    return sorted(hits, key=lambda h: -h[1])
