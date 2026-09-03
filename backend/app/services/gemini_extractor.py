"""Contract data extraction via the Google Gemini API.

Requests JSON output (response_mime_type application/json) and relies on the
explicit JSON-format instruction appended to the prompt for the exact shape.
The `google-generativeai` SDK is imported lazily so the app runs without it
installed unless this provider is selected.
"""
import logging

from .extraction_common import (
    ExtractionError,
    finalize_result,
    parse_json,
    retry_call,
    usage_from,
)

log = logging.getLogger(__name__)

# The 1.5 series was withdrawn from the Gemini API; a saved setting pointing at
# it keeps being sent and comes back 404 "model not found", which is the most
# common reason this provider stops working after having worked.
DEFAULT_MODEL = "gemini-2.5-pro"


def run_gemini(prompt: str, model: str, api_key: str | None) -> dict:
    """Call Gemini requesting JSON; returns {"data", "confidence", "model"}."""
    try:
        import google.generativeai as genai
        from google.api_core import exceptions as gexc
    except ImportError as exc:  # pragma: no cover - depends on optional dep
        raise ExtractionError(
            "The 'google-generativeai' package is not installed; run "
            "`pip install google-generativeai` to use the Gemini provider"
        ) from exc

    if not api_key:
        raise ExtractionError("No Gemini API key configured")

    model_name = model or DEFAULT_MODEL
    genai.configure(api_key=api_key)
    gmodel = genai.GenerativeModel(model_name)

    def do_call() -> dict:
        resp = gmodel.generate_content(
            prompt,
            generation_config={"response_mime_type": "application/json", "temperature": 0},
        )
        try:
            text = resp.text
        except Exception as exc:  # blocked / empty candidate
            raise ExtractionError(f"Gemini returned no usable text: {exc}") from exc
        meta = getattr(resp, "usage_metadata", None)
        usage = usage_from(
            getattr(meta, "prompt_token_count", None),
            getattr(meta, "candidates_token_count", None),
        )
        return finalize_result(parse_json(text), model_name, usage)

    return retry_call(
        do_call,
        (gexc.ServiceUnavailable, gexc.TooManyRequests, gexc.DeadlineExceeded, gexc.InternalServerError),
        "Gemini API",
    )
