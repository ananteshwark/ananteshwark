"""Contract data extraction via the Anthropic Claude API (Module 2).

Relies on the explicit JSON-shape instruction the dispatcher appends to the
prompt (plus a fence-tolerant parser and shape validation in `finalize_result`)
rather than a strict `output_config` json_schema. Claude's structured-output
compiler caps schemas at 16 union/nullable parameters, and the register — with
its scalar fields plus the nullable line-item sub-fields — exceeds that, so the
schema is used only for the other providers. Retries with exponential backoff.

Shared field list / schema / prompt assembly live in `extraction_common`; the
provider dispatcher is in `extraction.py`. `build_extraction_prompt`,
`EXTRACTION_SCHEMA`, `EXTRACTED_FIELDS` and `ExtractionError` are re-exported
here for backward compatibility.
"""
import logging

import anthropic

from ..config import settings
from .extraction_common import (  # re-exported for backward compatibility
    EXTRACTED_FIELDS,
    EXTRACTION_SCHEMA,
    ExtractionError,
    build_extraction_prompt,
    finalize_result,
    parse_json,
    retry_call,
    usage_from,
)

log = logging.getLogger(__name__)

__all__ = [
    "EXTRACTED_FIELDS", "EXTRACTION_SCHEMA", "ExtractionError",
    "build_extraction_prompt", "run_claude",
]


def _client(api_key: str | None) -> anthropic.Anthropic:
    # Key from admin settings (server-side only) or the ANTHROPIC_API_KEY env
    # var via the SDK; never sent to the frontend.
    if api_key:
        return anthropic.Anthropic(api_key=api_key)
    return anthropic.Anthropic()


def run_claude(prompt: str, model: str, api_key: str | None) -> dict:
    """Call Claude with structured output; returns {"data", "confidence", "model"}."""
    client = _client(api_key)

    def do_call() -> dict:
        with client.messages.stream(
            model=model,
            max_tokens=settings.CLAUDE_MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        ) as stream:
            response = stream.get_final_message()

        if response.stop_reason == "refusal":
            raise ExtractionError("Model declined to process this document")
        if response.stop_reason == "max_tokens":
            raise ExtractionError("Extraction output truncated (max_tokens)")

        text = next((b.text for b in response.content if b.type == "text"), "")
        usage = usage_from(
            getattr(response.usage, "input_tokens", None),
            getattr(response.usage, "output_tokens", None),
        )
        return finalize_result(parse_json(text), response.model, usage)

    try:
        return retry_call(
            do_call,
            (anthropic.RateLimitError, anthropic.InternalServerError, anthropic.APIConnectionError),
            "Claude API",
        )
    except anthropic.APIStatusError as exc:
        raise ExtractionError(f"Claude API error {exc.status_code}: {exc.message}") from exc
