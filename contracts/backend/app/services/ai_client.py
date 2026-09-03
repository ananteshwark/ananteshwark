"""Thin, provider-agnostic LLM helper for the authoring module's AI features
(clause segmentation, gap analysis, change-risk commentary, version summaries).

It reuses the SAME provider/model the admin configured for extraction
(extraction_provider + that provider's key/model), so there is one place to
choose the model. Every caller falls back to a deterministic result when AI is
unavailable (no key, SDK missing, disabled, or an API error), so behaviour is
graceful and the offline server keeps working.
"""
from __future__ import annotations

import json
import logging
import re

from .extraction import PROVIDERS
from .settings_store import get_setting

log = logging.getLogger(__name__)


class AIUnavailable(Exception):
    pass


def _resolve(db) -> tuple[str, str | None, str | None, str | None]:
    provider = (get_setting(db, "extraction_provider") or "claude").lower()
    if provider not in PROVIDERS:
        provider = "claude"
    _, key_setting, model_setting, default_model, base_setting = PROVIDERS[provider]
    api_key = get_setting(db, key_setting) or None
    model = get_setting(db, model_setting) or default_model
    base_url = (get_setting(db, base_setting) or None) if base_setting else None
    return provider, api_key, model, base_url


def ai_enabled(db) -> bool:
    """True when the AI enhancements should be attempted (admin toggle on and a
    key/endpoint is configured for the selected provider)."""
    if get_setting(db, "clause_ai_enabled") != "true":
        return False
    provider, api_key, _model, base_url = _resolve(db)
    if provider == "claude":
        # anthropic SDK can also read ANTHROPIC_API_KEY from the environment
        import os
        return bool(api_key or os.environ.get("ANTHROPIC_API_KEY"))
    if provider == "custom":
        return bool(base_url)
    return bool(api_key)


def llm_text(db, prompt: str, system: str | None = None, max_tokens: int = 1500) -> str:
    """Complete a prompt with the configured provider. Raises AIUnavailable on
    any problem so callers can fall back."""
    provider, api_key, model, base_url = _resolve(db)
    if not model:
        raise AIUnavailable("No model configured")
    try:
        if provider == "claude":
            import anthropic
            client = anthropic.Anthropic(api_key=api_key) if api_key else anthropic.Anthropic()
            kwargs = {"model": model, "max_tokens": max_tokens,
                      "messages": [{"role": "user", "content": prompt}]}
            if system:
                kwargs["system"] = system
            resp = client.messages.create(**kwargs)
            return "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        if provider in ("openai", "custom"):
            from openai import OpenAI
            client = OpenAI(api_key=api_key or "sk-none", base_url=base_url or None)
            messages = ([{"role": "system", "content": system}] if system else []) + \
                       [{"role": "user", "content": prompt}]
            resp = client.chat.completions.create(model=model, messages=messages, max_tokens=max_tokens)
            return resp.choices[0].message.content or ""
        if provider == "gemini":
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            gm = genai.GenerativeModel(model)
            resp = gm.generate_content((system + "\n\n" if system else "") + prompt)
            return resp.text or ""
    except AIUnavailable:
        raise
    except Exception as exc:  # SDK missing, network, API error -> fall back
        # Callers turn this into a deterministic result, so without a log line
        # here a rejected key or a withdrawn model produces no evidence at all
        # — the feature just quietly stops being AI-backed. Logged once, with
        # the provider and model, so `journalctl -u cms` answers "why".
        log.warning("AI call failed (%s / %s): %s", provider, model, exc)
        raise AIUnavailable(str(exc)) from exc
    raise AIUnavailable(f"Unsupported provider {provider}")


def llm_json(db, prompt: str, system: str | None = None, max_tokens: int = 2000):
    """Complete and parse a JSON object/array from the model's reply (tolerant of
    code fences and surrounding prose)."""
    text = llm_text(db, prompt, system=system, max_tokens=max_tokens)
    return parse_json_loose(text)


def parse_json_loose(text: str):
    text = (text or "").strip()
    # Strip ```json fences
    fence = re.match(r"^```[a-zA-Z]*\s*(.*?)\s*```$", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Grab the first {...} or [...] block
    for open_c, close_c in (("{", "}"), ("[", "]")):
        i, j = text.find(open_c), text.rfind(close_c)
        if 0 <= i < j:
            try:
                return json.loads(text[i:j + 1])
            except json.JSONDecodeError:
                continue
    raise AIUnavailable("Model reply was not valid JSON")
