"""Provider-agnostic contract extraction dispatcher.

Reads the admin-selected provider (Claude / OpenAI / Gemini / a custom
self-hosted OpenAI-compatible LLM) and its API key/model (and, for custom, its
base URL) from settings, assembles the prompt, and delegates to the matching
provider backend. The extraction worker calls `extract_contract_data`.
"""
import logging

from ..config import settings
from .extraction_common import (  # noqa: F401  (ExtractionError re-exported for callers)
    ExtractionError,
    JSON_FORMAT_INSTRUCTION,
    build_extraction_prompt,
)

log = logging.getLogger(__name__)

# provider key -> (backend, api-key setting, model setting, default model, base-url setting)
# base-url setting is None for hosted providers; the custom provider points the
# OpenAI-compatible client at a self-hosted endpoint.
PROVIDERS = {
    "claude": ("claude", "anthropic_api_key", "claude_model", None, None),
    "openai": ("openai", "openai_api_key", "openai_model", "gpt-4o", None),
    "gemini": ("gemini", "gemini_api_key", "gemini_model", "gemini-2.5-pro", None),
    "custom": ("custom", "custom_api_key", "custom_model", None, "custom_api_base"),
}


def _backend(name: str):
    if name == "claude":
        from .claude_extractor import run_claude
        return run_claude
    if name == "openai":
        from .openai_extractor import run_openai
        return run_openai
    if name == "gemini":
        from .gemini_extractor import run_gemini
        return run_gemini
    if name == "custom":
        from .custom_extractor import run_custom
        return run_custom
    raise ExtractionError(f"Unknown extraction provider: {name}")


def _resolve_config(secondary: bool = False):
    """Return (provider, api_key, model, base_url, org_entities, classification).

    When `secondary` is True the secondary provider is used (Retry with 2nd AI);
    it reuses that provider's configured key/model.
    """
    from ..database import SessionLocal
    from .settings_store import get_setting

    db = SessionLocal()
    try:
        setting = "secondary_extraction_provider" if secondary else "extraction_provider"
        provider = (get_setting(db, setting) or ("openai" if secondary else "claude")).lower()
        if provider not in PROVIDERS:
            provider = "claude"
        _, key_setting, model_setting, default_model, base_setting = PROVIDERS[provider]
        api_key = get_setting(db, key_setting) or None
        model = get_setting(db, model_setting) or default_model
        # Hosted providers fall back to the Claude model env default; the custom
        # provider requires an explicit model name (validated in its backend).
        if not model and provider != "custom":
            model = settings.CLAUDE_MODEL
        base_url = (get_setting(db, base_setting) or None) if base_setting else None
        # Structured internal-entity guidance (canonical names + aliases) so the
        # model outputs the exact canonical signing-entity name.
        from .internal_entities import prompt_guidance
        org_entities = prompt_guidance(db, get_setting(db, "organization_entities"))
        classification = _classification_guidance(db, get_setting)
        return provider, api_key, model, base_url, org_entities, classification
    finally:
        db.close()


def _classification_guidance(db, get_setting) -> str:
    """Prompt guidance for contract_type + tags: the admin's contract-type
    vocabulary and the existing tag names, so the model reuses known values."""
    from ..models import Tag

    types_raw = get_setting(db, "contract_types") or ""
    types = [t.strip() for t in types_raw.replace("\n", ",").split(",") if t.strip()]
    tag_names = [t.name for t in db.query(Tag).filter(Tag.deleted_at.is_(None)).all()]

    parts = []
    if types:
        parts.append(
            "For contract_type, choose the single best-fitting value from this list "
            "(or null if none fit): " + ", ".join(types) + "."
        )
    else:
        parts.append("For contract_type, give the single best document/contract category, or null.")
    if tag_names:
        parts.append(
            "For tags, prefer reusing these existing tags where they apply: "
            + ", ".join(tag_names) + "; add new short labels only when needed."
        )
    return "\n" + "\n".join(parts)


def extract_contract_data(document_text: str, prompt_template: str, use_secondary: bool = False) -> dict:
    """Extract contract fields using the configured provider (or the secondary
    provider when `use_secondary` is True).

    Returns {"data": {...}, "confidence": {...}, "model": "..."}.
    Raises ExtractionError on failure.
    """
    provider, api_key, model, base_url, org_entities, classification = _resolve_config(use_secondary)
    prompt = build_extraction_prompt(prompt_template, document_text, org_entities)
    prompt += JSON_FORMAT_INSTRUCTION + classification
    log.info("Extracting with %s provider=%s model=%s",
             "secondary" if use_secondary else "primary", provider, model)
    backend = _backend(provider)
    if provider == "custom":
        return backend(prompt, model, api_key, base_url)
    return backend(prompt, model, api_key)
