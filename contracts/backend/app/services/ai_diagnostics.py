"""Why the configured AI provider is not working.

Every AI feature in the app degrades gracefully: `llm_text` turns any failure
into `AIUnavailable` and the caller quietly produces a deterministic result.
That is right for the feature and useless for the administrator, who sees
template abstracts and no explanation. Email and webhooks each have a "send a
test" button; the AI provider had none, so "my Gemini API is not working" was
not answerable from inside the product.

This makes one real call with the stored settings and reports what actually
came back, plus the most likely cause where the error is a recognisable shape.
"""
from __future__ import annotations

import logging
import re

log = logging.getLogger(__name__)

# A trivially cheap prompt: the point is reaching the model, not what it says.
PROBE_PROMPT = "Reply with the single word: ok"

# Error text -> what an administrator should do about it. Matched case
# insensitively against the provider's own message, so the advice tracks what
# the SDK actually said rather than a status code we guessed at.
_HINTS: list[tuple[str, str]] = [
    (r"api[_ -]?key not valid|invalid[_ ]api[_ ]key|incorrect api key|unauthorized|401",
     "The API key was rejected. Check it was pasted whole and belongs to the "
     "project you expect."),
    (r"not found|404|is not found for api version|does not exist",
     "The model name was rejected by the provider. Retired models keep working "
     "in saved settings long after the provider withdraws them — pick a current "
     "model from the list."),
    (r"quota|429|rate limit|resource[_ ]exhausted",
     "The key is over its quota or rate limit. Check billing and usage limits "
     "for this project."),
    (r"permission|403|caller does not have permission|api has not been used|disabled",
     "The key is valid but not permitted to call this API. Enable the "
     "Generative Language API for the project and check any key restrictions."),
    (r"timed out|timeout|deadline",
     "The request timed out. If this server reaches the internet through a "
     "proxy, confirm the proxy allows the provider's host."),
    (r"connection|resolve|dns|network|unreachable|ssl|certificate|proxy|getaddrinfo",
     "The server could not reach the provider. On an isolated network this is "
     "expected — the AI features are optional and everything else keeps working."),
    (r"no module named|not installed",
     "The provider's Python package is not installed on this server. Install "
     "it into the backend virtualenv and restart the service."),
    (r"safety|blocked|recitation",
     "The provider accepted the call but refused to answer the probe. The "
     "connection works; the block is content policy."),
]


def hint_for(message: str) -> str | None:
    """The most likely cause of a provider error, or None if it is unfamiliar."""
    text = (message or "").lower()
    for pattern, advice in _HINTS:
        if re.search(pattern, text):
            return advice
    return None


def probe_provider(db) -> dict:
    """Call the configured provider once and report exactly what happened.

    Never raises: a failed test is a result, not a server error — the whole
    point is to hand back the provider's own message.
    """
    from .ai_client import AIUnavailable, _resolve, llm_text
    from .settings_store import get_setting

    provider, api_key, model, base_url = _resolve(db)
    enabled = get_setting(db, "clause_ai_enabled") == "true"
    result = {
        "provider": provider,
        "model": model,
        "base_url": base_url,
        "key_configured": bool(api_key),
        "ai_enabled": enabled,
        "ok": False,
        "error": None,
        "hint": None,
        "reply": None,
    }

    if not model:
        result["error"] = "No model is configured for this provider."
        return result
    if provider not in ("claude", "custom") and not api_key:
        result["error"] = f"No API key is configured for {provider}."
        result["hint"] = "Paste the key above and save before testing."
        return result

    try:
        reply = llm_text(db, PROBE_PROMPT, max_tokens=16)
    except AIUnavailable as exc:
        result["error"] = str(exc) or exc.__class__.__name__
        result["hint"] = hint_for(result["error"])
        return result
    except Exception as exc:  # a provider SDK raising something unexpected
        result["error"] = f"{exc.__class__.__name__}: {exc}"
        result["hint"] = hint_for(result["error"])
        return result

    result["ok"] = True
    result["reply"] = (reply or "").strip()[:200]
    if not enabled:
        result["hint"] = ("The provider answered, but AI enhancements are "
                          "switched off, so features still use the offline path.")
    return result
