"""Contract data extraction via a custom / self-hosted OpenAI-compatible LLM.

Points the OpenAI SDK at an admin-configured base URL, so an organization can
run extraction against its own small/large language model instead of a hosted
provider. Works with any server that exposes the OpenAI Chat Completions API —
vLLM, Ollama, LM Studio, LocalAI, text-generation-inference, and similar.

JSON output is requested via `response_format` when the server supports it; for
servers that don't, the explicit JSON-format instruction already appended to
the prompt plus the fence-tolerant parser cover the shape. The `openai` SDK is
imported lazily so the app runs without it installed unless this provider is
selected.
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


def run_custom(prompt: str, model: str, api_key: str | None, base_url: str | None) -> dict:
    """Call a custom OpenAI-compatible endpoint; returns {"data", "confidence", "model"}."""
    try:
        import openai
        from openai import OpenAI
    except ImportError as exc:  # pragma: no cover - depends on optional dep
        raise ExtractionError(
            "The 'openai' package is not installed; run `pip install openai` to use the custom provider"
        ) from exc

    if not base_url:
        raise ExtractionError("No base URL configured for the custom provider")
    if not model:
        raise ExtractionError("No model name configured for the custom provider")
    # Self-hosted servers often accept any token; the SDK still requires a non-empty one.
    client = OpenAI(base_url=base_url, api_key=api_key or "not-needed")

    def do_call(use_json_format: bool) -> dict:
        kwargs = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
        }
        if use_json_format:
            kwargs["response_format"] = {"type": "json_object"}
        resp = client.chat.completions.create(**kwargs)
        choice = resp.choices[0]
        if getattr(choice, "finish_reason", None) == "length":
            raise ExtractionError("Extraction output truncated (max tokens)")
        usage_obj = getattr(resp, "usage", None)
        usage = usage_from(
            getattr(usage_obj, "prompt_tokens", None),
            getattr(usage_obj, "completion_tokens", None),
        )
        return finalize_result(parse_json(choice.message.content), getattr(resp, "model", None) or model, usage)

    def attempt() -> dict:
        try:
            return do_call(use_json_format=True)
        except openai.BadRequestError:
            # Server doesn't accept response_format={"type": "json_object"} —
            # fall back to plain completion and rely on the prompt's JSON instruction.
            log.info("Custom endpoint rejected response_format; retrying without it")
            return do_call(use_json_format=False)

    try:
        return retry_call(
            attempt,
            (openai.RateLimitError, openai.APIConnectionError, openai.InternalServerError, openai.APITimeoutError),
            "Custom LLM API",
        )
    except openai.APIStatusError as exc:
        raise ExtractionError(f"Custom LLM API error {exc.status_code}: {exc.message}") from exc
