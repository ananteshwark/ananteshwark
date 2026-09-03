"""Contract-domain lexicon for concept-aware retrieval (G1).

The original hashing embedding scored character n-grams, so two clauses that say
the same thing in different words ("shall indemnify" / "will hold harmless")
shared almost no signal — measured lower than unrelated text. A neural encoder
fixes that, but costs ~1 GB of dependencies an air-gapped tarball can't carry.

Contract language is a bounded, highly conventional vocabulary, so most of the
gap closes by mapping surface wording onto canonical concept tokens before
embedding: both phrasings above emit ``concept_indemnity``, and the vectors
converge. This is deliberately domain-specific — it buys real paraphrase
matching offline, and the sentence-transformer provider remains available for
sites that can afford the dependency.
"""
from __future__ import annotations

import re

# Concept -> the surface phrasings that should collapse onto it. Longest phrases
# are matched first so "hold harmless" wins over a bare "hold".
CONCEPTS: dict[str, list[str]] = {
    "indemnity": [
        "indemnify", "indemnification", "indemnity", "indemnities",
        "hold harmless", "save harmless", "defend and hold", "defence obligation",
    ],
    "liability_cap": [
        "limitation of liability", "limit of liability", "aggregate liability",
        "total liability", "shall not exceed", "cap on liability", "liability cap",
        "maximum liability", "liable", "liability",
    ],
    "confidentiality": [
        "confidential information", "confidentiality", "non-disclosure",
        "nondisclosure", "proprietary information", "keep secret", "trade secret",
    ],
    "termination": [
        "terminate", "termination", "cancellation", "cancel this agreement",
        "end this agreement", "for convenience", "expiry of the term", "wind down",
    ],
    "payment": [
        "shall pay", "payment terms", "payment", "invoice", "invoiced", "remit",
        "remuneration", "consideration", "fees payable", "fees", "net 30", "net 45",
        "net 60", "due and payable",
    ],
    "notice": [
        "written notice", "prior notice", "notice period", "shall notify",
        "notify the other", "give notice", "notice",
    ],
    "force_majeure": [
        "force majeure", "act of god", "beyond the reasonable control",
        "beyond its reasonable control", "unforeseeable event",
    ],
    "governing_law": [
        "governing law", "governed by the laws", "jurisdiction", "courts at",
        "exclusive jurisdiction", "venue",
    ],
    "dispute_resolution": [
        "arbitration", "arbitrator", "arbitral", "dispute resolution",
        "conciliation", "mediation", "escalation of disputes",
    ],
    "ip_ownership": [
        "intellectual property", "ip rights", "work product", "deliverables vest",
        "assigns all right", "ownership of the", "moral rights", "background ip",
    ],
    "data_protection": [
        "data protection", "personal data", "gdpr", "data processor",
        "data controller", "processing of data", "data subject", "dpa",
    ],
    "warranty": [
        "represents and warrants", "warranties", "warranty", "warrant that",
        "fit for purpose", "merchantability",
    ],
    "insurance": [
        "insurance", "insured", "policy of insurance", "coverage of",
        "certificate of insurance", "commercial general liability",
    ],
    "audit": [
        "right to audit", "audit rights", "inspect the records", "right to inspect",
        "audit", "books and records",
    ],
    "assignment": [
        "assignment", "assign this agreement", "transfer its rights", "novate",
        "novation", "change of control",
    ],
    "non_solicitation": [
        "non-solicitation", "non solicit", "shall not solicit", "not hire",
        "poach", "no-poach",
    ],
    "service_levels": [
        "service level", "service levels", "sla", "uptime", "availability of",
        "response time", "resolution time", "service credit",
    ],
    "subcontracting": [
        "subcontract", "sub-contract", "subcontractor", "third party provider",
        "outsource",
    ],
    "compliance": [
        "anti-bribery", "anti-corruption", "bribery", "corruption", "fcpa",
        "comply with all applicable", "compliance with laws", "sanctions",
    ],
    "renewal": [
        "auto-renew", "automatically renew", "renewal term", "evergreen",
        "extend the term", "renewal", "renew",
    ],
}

# Party roles collapse too: who is doing the obligating matters less than what
# the obligation is, and vendor/supplier/provider are the same actor.
PARTY_TERMS: dict[str, list[str]] = {
    "party_vendor": ["vendor", "supplier", "provider", "contractor", "seller",
                     "service provider", "licensor", "consultant"],
    "party_customer": ["customer", "client", "purchaser", "buyer", "licensee",
                       "the company", "company"],
}

_NUMBER_WORDS = {
    "zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5",
    "six": "6", "seven": "7", "eight": "8", "nine": "9", "ten": "10",
    "eleven": "11", "twelve": "12", "thirteen": "13", "fourteen": "14",
    "fifteen": "15", "sixteen": "16", "seventeen": "17", "eighteen": "18",
    "nineteen": "19", "twenty": "20", "thirty": "30", "forty": "40",
    "fifty": "50", "sixty": "60", "seventy": "70", "eighty": "80",
    "ninety": "90", "hundred": "100", "annual": "12", "annually": "12",
    "monthly": "1", "quarterly": "3", "yearly": "12",
}

# Modal verbs all express obligation; normalising them stops "shall" vs "will"
# from looking like a difference.
_MODALS = {"shall": "shall", "will": "shall", "must": "shall", "agrees to": "shall",
           "undertakes to": "shall", "is obliged to": "shall", "is required to": "shall"}

# Some legal phrases are routinely split by their object — "hold the Company
# harmless", "indemnify and hold Buyer harmless", "liability shall in no event
# exceed". A contiguous-phrase matcher misses every one of them, which is most
# real drafting, so these are matched with a bounded gap.
_GAPPY: list[tuple[str, str]] = [
    (r"hold\s+(?:\w+\s+){0,4}harmless", "concept_indemnity"),
    (r"indemnif\w*\s+(?:\w+\s+){0,6}harmless", "concept_indemnity"),
    (r"defend\s+(?:\w+\s+){0,4}(?:harmless|against)", "concept_indemnity"),
    (r"liability\s+(?:\w+\s+){0,6}(?:exceed|capped|limited)", "concept_liability_cap"),
    (r"(?:exceed|capped|limited)\s+(?:\w+\s+){0,6}liability", "concept_liability_cap"),
    (r"terminat\w+\s+(?:\w+\s+){0,6}notice", "concept_termination"),
    (r"notice\s+(?:\w+\s+){0,6}terminat\w+", "concept_termination"),
    (r"cancel\w*\s+(?:\w+\s+){0,6}notice", "concept_termination"),
    (r"keep\s+(?:\w+\s+){0,4}confidential", "concept_confidentiality"),
    (r"treat\s+(?:\w+\s+){0,4}(?:confidential|secret)", "concept_confidentiality"),
    (r"pay\w*\s+(?:\w+\s+){0,6}(?:days|invoice|fees)", "concept_payment"),
    (r"maintain\s+(?:\w+\s+){0,4}insurance", "concept_insurance"),
    (r"renew\w*\s+(?:\w+\s+){0,6}term", "concept_renewal"),
    # Assignment is asked about as a question far more often than it is named:
    # "can the agreement be assigned", "may not be assigned without consent".
    # Deliberately gappy rather than a bare `assign` stem — "assigns all right,
    # title and interest" is IP ownership, not assignment, and a stem broad
    # enough to catch "assigned" would relabel every IP clause in the corpus.
    # Requiring the agreement nearby is what keeps the two apart.
    (r"assign\w*\s+(?:\w+\s+){0,4}(?:agreement|contract)", "concept_assignment"),
    (r"(?:agreement|contract)\s+(?:\w+\s+){0,4}assign\w*", "concept_assignment"),
]

# Contract text inflects freely — "indemnifies", "terminated", "warrants",
# "subcontracts", "payable" — but the surface table above lists citation forms
# only. Measured: "who indemnifies whom for third party claims" emitted no
# concept at all and fell back to lexical matching, scoring 0.12 against a
# corpus where "shall indemnify" scored 0.59. These stems close that gap for the
# families where the prefix is unambiguous in contract language; the rest stay
# phrase-matched, because a broad stem is how a lexicon starts mislabelling.
_STEMS: list[tuple[str, str]] = [
    (r"indemnif|indemnit", "concept_indemnity"),
    (r"liabilit|liable", "concept_liability_cap"),
    (r"confidential|nondisclos", "concept_confidentiality"),
    (r"terminat|cancel", "concept_termination"),
    (r"payment|payable|invoic|remitt?", "concept_payment"),
    (r"notic|notif", "concept_notice"),
    # "disput" covers "dispute", "disputes", "disputed", "disputing". In
    # contract language a dispute is essentially always about how it gets
    # resolved, so the prefix is unambiguous here in the way the comment above
    # requires — unlike a bare "assign", which is handled gappily instead.
    (r"arbitrat|mediat|conciliat|disput", "concept_dispute_resolution"),
    (r"warrant", "concept_warranty"),
    (r"insur", "concept_insurance"),
    (r"audit", "concept_audit"),
    (r"assignment|assignab|novat", "concept_assignment"),
    (r"solicit|poach", "concept_non_solicitation"),
    (r"subcontract|sub-contract|outsourc", "concept_subcontracting"),
    (r"complian|complie|comply", "concept_compliance"),
    (r"renew", "concept_renewal"),
    (r"availabilit|uptime", "concept_service_levels"),
]

_GAPPY_COMPILED: list[tuple[object, str]] | None = None
_STEMS_COMPILED: list[tuple[object, str]] | None = None
_PHRASES: list[tuple[str, str]] | None = None


def _gappy_table() -> list[tuple[object, str]]:
    global _GAPPY_COMPILED
    if _GAPPY_COMPILED is None:
        _GAPPY_COMPILED = [(re.compile(p), t) for p, t in _GAPPY]
    return _GAPPY_COMPILED


def _stem_table() -> list[tuple[object, str]]:
    global _STEMS_COMPILED
    if _STEMS_COMPILED is None:
        _STEMS_COMPILED = [(re.compile(rf"\b(?:{p})\w*\b"), t) for p, t in _STEMS]
    return _STEMS_COMPILED


def _phrase_table() -> list[tuple[str, str]]:
    """(surface phrase, emitted token) sorted longest-first for greedy matching."""
    global _PHRASES
    if _PHRASES is None:
        pairs: list[tuple[str, str]] = []
        for concept, surfaces in CONCEPTS.items():
            for s in surfaces:
                pairs.append((s, f"concept_{concept}"))
        for role, surfaces in PARTY_TERMS.items():
            for s in surfaces:
                pairs.append((s, role))
        for surface, token in _MODALS.items():
            pairs.append((surface, token))
        pairs.sort(key=lambda p: -len(p[0]))
        _PHRASES = pairs
    return _PHRASES


def normalize(text: str) -> str:
    """Lower-case, collapse whitespace, turn number words into digits, and drop
    punctuation that carries no meaning for matching."""
    s = (text or "").lower()
    s = re.sub(r"[^a-z0-9\s%/-]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        return ""
    words = [_NUMBER_WORDS.get(w, w) for w in s.split(" ")]
    return " ".join(words)


def expand(text: str) -> list[str]:
    """Tokens for embedding: the normalized words, plus a concept token for every
    domain phrase found. Concept tokens are repeated so they outweigh incidental
    vocabulary — two clauses about indemnity should look alike even when every
    other word differs.
    """
    norm = normalize(text)
    if not norm:
        return []
    tokens = norm.split(" ")
    padded = f" {norm} "
    concepts: set[str] = set()
    seen_spans: list[tuple[int, int]] = []

    for surface, token in _phrase_table():
        start = padded.find(f" {surface} ")
        if start < 0:
            continue
        end = start + len(surface) + 2
        # Skip a phrase already covered by a longer match at the same place.
        if any(s <= start and end <= e for s, e in seen_spans):
            continue
        seen_spans.append((start, end))
        concepts.add(token)

    # Split phrases ("hold the Company harmless") that the contiguous pass misses.
    for pattern, token in _gappy_table():
        if pattern.search(norm):
            concepts.add(token)

    # Inflected forms ("indemnifies", "terminated") the citation-form table misses.
    for pattern, token in _stem_table():
        if pattern.search(norm):
            concepts.add(token)

    # Concepts are deduplicated: a clause that says "indemnify" and "hold
    # harmless" is about indemnity once, not twice. Weighting by repetition let
    # verbose drafting outrank a concise paraphrase of the same obligation.
    return tokens + [t for token in sorted(concepts) for t in (token,) * 4]


def concepts_in(text: str) -> set[str]:
    """The distinct concept names present — used for explaining a match and for
    structured filters."""
    return {t[len("concept_"):] for t in expand(text) if t.startswith("concept_")}
