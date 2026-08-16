"""Citation enforcement for generated answers (G4).

A model asked to cite `[#123]` will sometimes cite a contract it was never
shown, or attach a citation to a claim the source does not support. Both look
identical to a correct answer in the UI, which is the dangerous part.

Every citation is therefore checked against two things: the retrieved set (was
this contract actually in context?) and the source text (does the sentence's
substance appear there?). Unverifiable citations are demoted to a warning rather
than silently presented as grounded.
"""
from __future__ import annotations

import re

_CITE = re.compile(r"\[#(\d+)\]")

# Words too common to prove anything about overlap.
_STOP = {
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "with", "by",
    "is", "are", "was", "were", "be", "been", "shall", "will", "must", "that",
    "this", "it", "as", "at", "from", "any", "all", "not", "no", "such", "which",
    "contract", "agreement", "party", "parties", "may", "has", "have", "if",
}


def _content_words(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {w for w in words if len(w) > 2 and w not in _STOP}


def _sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+|\n+", text or "")
    return [p.strip() for p in parts if p.strip()]


def verify(answer: str, retrieved: dict[int, str], *, min_overlap: float = 0.18) -> dict:
    """Check every `[#n]` in `answer`.

    `retrieved` maps contract number -> the source text that was actually put in
    the model's context.

    Returns the answer annotated with a per-citation verdict:
      ``ok``          cited contract was retrieved and supports the sentence
      ``unsupported`` cited contract was retrieved but the sentence's content
                      words barely appear in it
      ``fabricated``  cited contract was never retrieved
    """
    cited = [int(n) for n in _CITE.findall(answer or "")]
    results: list[dict] = []
    seen: set[tuple[int, str]] = set()

    for sentence in _sentences(answer):
        nums = [int(n) for n in _CITE.findall(sentence)]
        if not nums:
            continue
        claim = _content_words(_CITE.sub("", sentence))
        for n in nums:
            key = (n, sentence[:60])
            if key in seen:
                continue
            seen.add(key)
            source = retrieved.get(n)
            if source is None:
                results.append({"contract_id": n, "status": "fabricated",
                                "sentence": sentence,
                                "reason": "This contract was not among the sources retrieved."})
                continue
            src_words = _content_words(source)
            overlap = (len(claim & src_words) / len(claim)) if claim else 1.0
            if overlap >= min_overlap:
                results.append({"contract_id": n, "status": "ok",
                                "sentence": sentence, "overlap": round(overlap, 3)})
            else:
                results.append({"contract_id": n, "status": "unsupported",
                                "sentence": sentence, "overlap": round(overlap, 3),
                                "reason": "The cited contract does not appear to contain this claim."})

    problems = [r for r in results if r["status"] != "ok"]
    return {
        "citations": results,
        "cited_ids": sorted(set(cited)),
        "verified": len(problems) == 0,
        "problems": problems,
        "grounded_ratio": round(1 - len(problems) / len(results), 3) if results else None,
    }


def annotate(answer: str, report: dict) -> str:
    """Mark unverifiable citations inline so the reader can see which parts of an
    answer are not grounded, instead of trusting the whole thing equally."""
    if report.get("verified", True):
        return answer
    bad = {r["contract_id"] for r in report.get("problems", [])}
    out = answer
    for n in sorted(bad):
        out = out.replace(f"[#{n}]", f"[#{n} ⚠ unverified]")
    return out
