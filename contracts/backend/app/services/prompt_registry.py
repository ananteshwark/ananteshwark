"""Per-feature prompt versions and model routing (I3).

Until now every AI feature shared one globally configured model and an inline
prompt, so there was no way to use a cheap model for summarisation and a strong
one for redlining, no way to roll a prompt back, and no way to tell which prompt
produced a given output.

Prompts are versioned per feature in settings (an admin can override any of them
without a deploy); models are routed per feature with a fallback to the global
setting. Both are recorded on every AiRun.
"""
from __future__ import annotations

from .settings_store import get_setting

# feature -> (version, default prompt template). `{...}` placeholders are filled
# by the caller with str.format.
DEFAULT_PROMPTS: dict[str, tuple[str, str]] = {
    "summary": ("v1",
        "You are contract counsel. Write a single, plain-language paragraph "
        "(3-4 sentences) abstracting the contract below for a busy reviewer: "
        "what it is, who the parties are, the commercial substance, and any "
        "notable term. No preamble.\n\nKEY FACTS:\n{facts}\n\nCONTRACT TEXT:\n{body}"),
    "obligations": ("v1",
        "Extract the concrete, trackable OBLIGATIONS from the contract text below. "
        "Return STRICT JSON: a list of objects with keys: title, obligation_type "
        "(payment, report, renewal, notice, sla, insurance, audit, compliance, other), "
        "owner_party (us, counterparty, both), frequency, source_text. "
        "Only real obligations, no boilerplate.\n\nCONTRACT TEXT:\n{body}"),
    "ask": ("v2",
        "Answer the question using ONLY the contract excerpts below. Cite the "
        "contract numbers you rely on like [#123]. Cite only contracts shown here. "
        "If the answer isn't in the excerpts, say so plainly.\n\n"
        "QUESTION: {question}\n\nCONTRACTS:\n{context}"),
    "ask_one": ("v1",
        "Answer the question using ONLY this contract. Quote the wording you rely "
        "on. If it is not addressed, say so.\n\nQUESTION: {question}\n\n"
        "CONTRACT #{sr_no}:\n{body}"),
    "negotiation_reply": ("v1",
        "Draft a short, professional reply to a counterparty about one contract "
        "clause. Be courteous and specific; do not invent terms.\n\n"
        "CLAUSE: {clause}\nTHEIR PROPOSAL: {proposal}\nOUR DECISION: {decision}\n"
        "OUR REASONING: {rationale}\nOUR COUNTER-WORDING: {counter}\n"),
    "intake": ("v1",
        "Extract a contract request from this message. Return STRICT JSON with keys: "
        "contract_type, counterparty_name, estimated_value, currency, needed_by "
        "(YYYY-MM-DD or null), priority (low|normal|high), title.\n\nMESSAGE: {text}"),
}

# Features where a weaker/cheaper model is usually fine, for sites that route.
CHEAP_FEATURES = {"summary", "intake"}


def prompt_for(db, feature: str) -> tuple[str, str]:
    """(version, template) — an admin override wins over the built-in default."""
    version, template = DEFAULT_PROMPTS.get(feature, ("v0", "{body}"))
    override = get_setting(db, f"prompt_{feature}")
    if override and override.strip():
        return f"{version}+custom", override
    return version, template


def model_for(db, feature: str) -> str | None:
    """The model this feature should use: a per-feature override, else the
    globally configured model."""
    override = (get_setting(db, f"model_{feature}") or "").strip()
    if override:
        return override
    try:
        from .ai_client import _resolve
        _provider, _key, model, _base = _resolve(db)
        return model
    except Exception:
        return None


def render(db, feature: str, values: dict) -> tuple[str, str]:
    """(version, rendered prompt). Missing placeholders render as empty rather
    than raising — a prompt override with a typo shouldn't break the feature."""
    version, template = prompt_for(db, feature)
    class _Safe(dict):
        def __missing__(self, key):  # noqa: D105
            return ""
    try:
        return version, template.format_map(_Safe(values))
    except Exception:
        return version, template


def registry(db) -> list[dict]:
    """Everything an admin can see/override, for the governance screen."""
    out = []
    for feature, (_base_version, template) in sorted(DEFAULT_PROMPTS.items()):
        override = get_setting(db, f"prompt_{feature}") or ""
        # Report the effective version — the one stamped onto every AiRun — so a
        # customized prompt is visible in the audit trail, not hidden behind the
        # built-in version number.
        version, _ = prompt_for(db, feature)
        out.append({
            "feature": feature,
            "version": version,
            "customized": bool(override.strip()),
            "model": model_for(db, feature),
            "model_override": (get_setting(db, f"model_{feature}") or "").strip(),
            "default_prompt": template,
            "prompt": override.strip() or template,
            "cheap_ok": feature in CHEAP_FEATURES,
        })
    return out
