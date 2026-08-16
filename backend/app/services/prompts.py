"""Versioned, admin-editable prompts.

The extraction prompt was already versioned (name "contract_extraction"). This
module generalizes the mechanism so the authoring AI prompts (clause polish,
clause-difference summary, …) are editable and versioned too, each under its own
`name`. Every kind has a built-in default and a documented set of `{placeholder}`
tokens; the active version's content is used when present, else the default.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import PromptTemplate

EXTRACTION = "contract_extraction"

# name -> default definition for the authoring prompts.
REGISTRY: dict[str, dict] = {
    "clause_polish": {
        "label": "Clause polish",
        "description": "Rewrites a clause into clear, professional language for the curated set.",
        "system": "You are a contracts editor. Output only the clause.",
        "placeholders": ["clause_type", "clause"],
        "default": (
            "Clause type: {clause_type}.\n"
            "Polish the clause below into clear, professional contract language. "
            "Preserve its legal meaning, obligations and any figures exactly — do not add, "
            "remove or weaken terms. Fix grammar, spacing and punctuation; keep it as a single "
            "clause. Return only the rewritten clause text.\n\n"
            "CLAUSE:\n{clause}"
        ),
    },
    "clause_summary": {
        "label": "Clause difference summary",
        "description": "One-sentence summary of how a clause version differs from its siblings.",
        "system": "Be concise; one sentence.",
        "placeholders": ["clause_type", "this_version", "other_versions"],
        "default": (
            "Clause type: {clause_type}. Summarize in one sentence how THIS version "
            "differs from the others (e.g. 'caps liability at 12 months of fees' vs 'uncapped').\n\n"
            "THIS VERSION:\n{this_version}\n\nOTHER VERSIONS:\n{other_versions}"
        ),
    },
}


def active_content(db: Session, name: str, default: str) -> str:
    """Return the active version's content for `name`, else `default`."""
    row = (
        db.query(PromptTemplate)
        .filter(PromptTemplate.name == name, PromptTemplate.is_active.is_(True))
        .order_by(PromptTemplate.version.desc())
        .first()
    )
    return row.content if row and row.content else default


def render(db: Session, name: str, context: dict) -> str:
    """Render a registered authoring prompt with `{placeholder}` substitution."""
    d = REGISTRY.get(name, {})
    template = active_content(db, name, d.get("default", ""))
    out = template
    for key, value in context.items():
        out = out.replace("{" + key + "}", "" if value is None else str(value))
    return out


def system_for(name: str) -> str:
    return REGISTRY.get(name, {}).get("system", "")


def catalog(db: Session) -> list[dict]:
    """Authoring prompt kinds with their active/default content, for the admin UI."""
    out = []
    for name, d in REGISTRY.items():
        out.append({
            "name": name, "label": d["label"], "description": d["description"],
            "system": d.get("system", ""), "placeholders": d.get("placeholders", []),
            "default": d.get("default", ""),
            "content": active_content(db, name, d.get("default", "")),
            "customized": active_content(db, name, d.get("default", "")) != d.get("default", ""),
        })
    return out
