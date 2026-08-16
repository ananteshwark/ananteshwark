"""Contract data extraction via the OpenAI (ChatGPT) API.

Uses Chat Completions structured outputs (response_format json_schema, strict)
so the reply is valid JSON matching the register schema. The `openai` SDK is
imported lazily so the app runs without it installed unless this provider is
selected.
"""
import logging

from .extraction_common import (
    EXTRACTION_SCHEMA,
    ExtractionError,
    finalize_result,
    parse_json,
    retry_call,
    usage_from,
)

log = logging.getLogger(__name__)

DEFAULT_MODEL = "gpt-4o"


def run_openai(prompt: str, model: str, api_key: str | None) -> dict:
    """Call OpenAI with structured output; returns {"data", "confidence", "model"}."""
    try:
        import openai
        from openai import OpenAI
    except ImportError as exc:  # pragma: no cover - depends on optional dep
        raise ExtractionError(
            "The 'openai' package is not installed; run `pip install openai` to use the OpenAI provider"
        ) from exc

    if not api_key:
        raise ExtractionError("No OpenAI API key configured")
    client = OpenAI(api_key=api_key)

    def do_call() -> dict:
        resp = client.chat.completions.create(
            model=model or DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "contract_extraction", "schema": EXTRACTION_SCHEMA, "strict": True},
            },
            temperature=0,
        )
        choice = resp.choices[0]
        if choice.finish_reason == "length":
            raise ExtractionError("Extraction output truncated (max tokens)")
        if getattr(choice.message, "refusal", None):
            raise ExtractionError(f"Model declined to process this document: {choice.message.refusal}")
        usage = usage_from(
            getattr(resp.usage, "prompt_tokens", None),
            getattr(resp.usage, "completion_tokens", None),
        )
        return finalize_result(parse_json(choice.message.content), resp.model or model, usage)

    try:
        return retry_call(
            do_call,
            (openai.RateLimitError, openai.APIConnectionError, openai.InternalServerError, openai.APITimeoutError),
            "OpenAI API",
        )
    except openai.APIStatusError as exc:
        raise ExtractionError(f"OpenAI API error {exc.status_code}: {exc.message}") from exc
