"""Eval harness for the AI-backed features (I2).

Before this, a prompt or provider change shipped blind: there was no way to tell
whether retrieval, obligation extraction or deviation scoring got better or
worse. The golden sets below are small, hand-checked, and deliberately include
the exact cases that exposed real defects — most importantly the paraphrase
pairs that scored below noise under the original embedding.

Runs are deterministic and need no model, so they can gate CI.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# --- Golden sets ----------------------------------------------------------

# (a, b, should_match). The False rows are the guard rails: a retrieval change
# that pulls unrelated text closer is a regression even if paraphrases improve.
RETRIEVAL_PAIRS: list[tuple[str, str, bool]] = [
    ("the vendor shall indemnify the company", "the supplier will hold us harmless", True),
    ("payment due within thirty days", "invoices payable in 30 days", True),
    ("either party may terminate on 60 days notice",
     "this agreement may be cancelled with two months prior written notice", True),
    ("total liability shall not exceed the fees paid",
     "aggregate liability is capped at amounts paid", True),
    ("each party shall keep confidential information secret",
     "both parties must treat proprietary data as confidential", True),
    ("the provider guarantees 99.9% uptime",
     "supplier commits to service availability of 99.9 percent", True),
    # Inflected phrasing: the lexicon lists citation forms, so these scored as
    # noise until the stem pass was added.
    ("who indemnifies the customer for third party claims",
     "the supplier shall hold the customer harmless", True),
    ("the agreement was terminated for convenience",
     "either party may cancel this agreement on notice", True),
    ("teleradiology imaging interpretation services",
     "cafeteria catering and food services", False),
    ("the vendor shall indemnify the company",
     "governing law is the laws of India", False),
    ("payment due within thirty days",
     "the contractor shall maintain professional indemnity insurance", False),
]

# (text, expected obligation types present)
OBLIGATION_CASES: list[tuple[str, set[str]]] = [
    ("The Company shall pay each invoice within Net 45 days of receipt.", {"payment"}),
    ("The Vendor shall submit a monthly SLA report detailing uptime and incidents.",
     {"report", "sla"}),
    ("This agreement shall auto-renew for successive one-year terms unless either "
     "party gives 60 days' notice.", {"renewal", "notice"}),
    ("The Vendor shall maintain commercial general liability insurance of $2,000,000.",
     {"insurance"}),
    ("The weather in the valley is pleasant this time of year.", set()),
]

# (text, expected concepts)
CONCEPT_CASES: list[tuple[str, set[str]]] = [
    ("the vendor shall indemnify and hold the Company harmless", {"indemnity"}),
    ("aggregate liability shall in no event exceed the fees", {"liability_cap"}),
    ("either party may terminate on thirty days written notice", {"termination"}),
    ("all personal data shall be processed per GDPR", {"data_protection"}),
    ("the quick brown fox jumps over the lazy dog", set()),
]


@dataclass
class EvalResult:
    name: str
    passed: int = 0
    failed: int = 0
    failures: list[str] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.passed + self.failed

    @property
    def score(self) -> float:
        return round(self.passed / self.total, 3) if self.total else 1.0

    def as_dict(self) -> dict:
        return {"name": self.name, "passed": self.passed, "failed": self.failed,
                "total": self.total, "score": self.score, "failures": self.failures[:10]}


def eval_retrieval(db=None) -> EvalResult:
    """Paraphrases must be separable from unrelated text.

    Scored as a ranking property rather than an absolute threshold: the weakest
    true match must beat the strongest false one. That is exactly the invariant
    the original embedding violated.
    """
    from .embeddings import cosine, embed
    res = EvalResult("retrieval")
    matches, non_matches = [], []
    for a, b, should in RETRIEVAL_PAIRS:
        score = cosine(embed(a, db), embed(b, db))
        (matches if should else non_matches).append((score, a, b))

    worst_match = min(matches, default=(1.0, "", ""))
    best_non = max(non_matches, default=(0.0, "", ""))
    for score, a, b in matches:
        if score > best_non[0]:
            res.passed += 1
        else:
            res.failed += 1
            res.failures.append(
                f"paraphrase scored {score:.3f}, not above unrelated {best_non[0]:.3f}: “{a[:40]}”")
    for score, a, b in non_matches:
        if score < worst_match[0]:
            res.passed += 1
        else:
            res.failed += 1
            res.failures.append(
                f"unrelated pair scored {score:.3f}, at or above weakest paraphrase "
                f"{worst_match[0]:.3f}: “{a[:40]}”")
    return res


def eval_concepts(db=None) -> EvalResult:
    from .legal_lexicon import concepts_in
    res = EvalResult("concepts")
    for text, expected in CONCEPT_CASES:
        found = concepts_in(text)
        if expected <= found and (expected or not found):
            res.passed += 1
        else:
            res.failed += 1
            res.failures.append(f"expected {sorted(expected) or 'none'}, got "
                                f"{sorted(found) or 'none'}: “{text[:44]}”")
    return res


def eval_obligations(db) -> EvalResult:
    """Obligation extraction on the deterministic path."""
    from .obligations import _deterministic
    res = EvalResult("obligations")
    for text, expected in OBLIGATION_CASES:
        found = {o["obligation_type"] for o in _deterministic(text)}
        if not expected:
            ok = not found
        else:
            ok = bool(expected & found)
        if ok:
            res.passed += 1
        else:
            res.failed += 1
            res.failures.append(f"expected any of {sorted(expected) or 'none'}, got "
                                f"{sorted(found) or 'none'}: “{text[:44]}”")
    return res


def eval_citations(db=None) -> EvalResult:
    """Citation verification must catch both failure modes."""
    from .citations import verify
    res = EvalResult("citations")
    cases = [
        ("Liability is capped at twelve months of fees [#1].",
         {1: "The aggregate liability shall be capped at twelve months of fees paid."}, True),
        ("The cap is twelve months of fees [#999].", {1: "Liability is capped."}, False),
        ("The agreement mandates biannual penetration testing of the gateway [#1].",
         {1: "The vendor provides cafeteria catering and food services."}, False),
    ]
    for answer, sources, should_verify in cases:
        report = verify(answer, sources)
        if report["verified"] is should_verify:
            res.passed += 1
        else:
            res.failed += 1
            res.failures.append(
                f"expected verified={should_verify}, got {report['verified']}: “{answer[:44]}”")
    return res


SUITES = {
    "retrieval": eval_retrieval,
    "concepts": eval_concepts,
    "obligations": eval_obligations,
    "citations": eval_citations,
}


def run_all(db=None, suites: list[str] | None = None) -> dict:
    names = suites or list(SUITES)
    results = []
    for name in names:
        fn = SUITES.get(name)
        if fn is None:
            continue
        try:
            results.append(fn(db).as_dict())
        except Exception as exc:  # a broken suite is a failure, not a crash
            results.append({"name": name, "passed": 0, "failed": 1, "total": 1,
                            "score": 0.0, "failures": [f"suite raised: {exc}"]})
    total = sum(r["total"] for r in results)
    passed = sum(r["passed"] for r in results)
    return {
        "suites": results,
        "passed": passed,
        "total": total,
        "score": round(passed / total, 3) if total else 1.0,
        "ok": all(r["failed"] == 0 for r in results),
    }
