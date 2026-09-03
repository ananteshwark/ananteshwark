"""Shared pieces for contract extraction across AI providers (Claude / OpenAI /
Gemini): the register field list, the JSON schema, prompt assembly, a result
finalizer, and a small retry helper. Provider-specific API calls live in the
per-provider modules; the dispatcher in `extraction.py` wires them together.
"""
import json
import logging
import time

from ..config import settings

log = logging.getLogger(__name__)

# Field list mirrors the organization's 15-column contract register.
EXTRACTED_FIELDS = [
    "signing_entity",
    "vendor",
    "vendor_address",
    "start_date",
    "end_date",
    "contract_tenure",
    "department",
    "po_number",
    "contract_value",
    "currency",
    "iks_signing_authority",
    "vendor_signing_authority",
    "contract_service",
    "service_summary",
    "payment_term",
    "notice_period",
    "contract_type",
    "location",
]

_STRING_OR_NULL = {"type": ["string", "null"]}
_NUMBER_OR_NULL = {"type": ["number", "null"]}

# A single priced line item / rate-card row within a contract. `unit` is the
# unit of measure the rate applies to (e.g. "per licence", "per hour", "per
# month"); amount is the line total (typically quantity x unit_rate).
LINE_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "item": _STRING_OR_NULL,
        "unit": _STRING_OR_NULL,
        "quantity": _NUMBER_OR_NULL,
        "unit_rate": _NUMBER_OR_NULL,
        "amount": _NUMBER_OR_NULL,
    },
    "required": ["item", "unit", "quantity", "unit_rate", "amount"],
    "additionalProperties": False,
}

# Data properties = the scalar register fields plus the line_items and tags
# arrays. `confidence` stays keyed by the scalar fields only (EXTRACTED_FIELDS).
_DATA_FIELDS = EXTRACTED_FIELDS + ["line_items", "tags"]

EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "data": {
            "type": "object",
            "properties": {
                "signing_entity": _STRING_OR_NULL,
                "vendor": _STRING_OR_NULL,
                "vendor_address": _STRING_OR_NULL,
                "start_date": _STRING_OR_NULL,
                "end_date": _STRING_OR_NULL,
                "contract_tenure": _STRING_OR_NULL,
                "department": _STRING_OR_NULL,
                "po_number": _STRING_OR_NULL,
                "contract_value": _NUMBER_OR_NULL,
                "currency": _STRING_OR_NULL,
                "iks_signing_authority": _STRING_OR_NULL,
                "vendor_signing_authority": _STRING_OR_NULL,
                "contract_service": _STRING_OR_NULL,
                "service_summary": _STRING_OR_NULL,
                "payment_term": _STRING_OR_NULL,
                "notice_period": _STRING_OR_NULL,
                "contract_type": _STRING_OR_NULL,
                "location": _STRING_OR_NULL,
                "line_items": {"type": "array", "items": LINE_ITEM_SCHEMA},
                "tags": {"type": "array", "items": {"type": "string"}},
            },
            "required": _DATA_FIELDS,
            "additionalProperties": False,
        },
        "confidence": {
            "type": "object",
            "properties": {f: {"type": "number"} for f in EXTRACTED_FIELDS},
            "required": EXTRACTED_FIELDS,
            "additionalProperties": False,
        },
    },
    "required": ["data", "confidence"],
    "additionalProperties": False,
}


class ExtractionError(Exception):
    pass


def build_extraction_prompt(template: str, document_text: str, org_entities: str) -> str:
    """Assemble the final prompt: inject the known organization-entity names so the
    model classifies them as the signing entity (not the vendor), then the document.

    If the template already contains an `{organization_entities}` placeholder it is
    filled in place; otherwise (older prompt versions) an equivalent instruction is
    prepended, so the guidance applies to any active prompt version.
    """
    org_entities = (org_entities or "").strip()
    text = template
    # Instruction to normalize the signing entity to its exact canonical name.
    canonical_note = (
        " Each entry lists a canonical name and, in parentheses, the other ways it "
        "may appear; ALWAYS record the signing entity using its exact canonical name "
        "(the text before any \"also written as\"), not the variant found in the document."
    ) if org_entities else ""
    if "{organization_entities}" in text:
        text = text.replace("{organization_entities}", org_entities or "(none configured)")
        if canonical_note:
            text += "\n\n" + canonical_note.strip()
    elif org_entities:
        text = (
            "IMPORTANT: The following names (and close variants/abbreviations) refer "
            "to OUR organization — the signing entity — and must NEVER be recorded as "
            "the vendor: " + org_entities + ". When one party to the contract matches "
            "one of these, set it as `signing_entity` and record the OTHER party as "
            "`vendor`." + canonical_note + "\n\n"
        ) + text
    return text.replace("{document_text}", document_text[:400_000])


# Appended to the prompt for every provider so the JSON contract is explicit,
# even for providers where the structured-output schema isn't enforced natively.
JSON_FORMAT_INSTRUCTION = (
    "\n\nReturn ONLY a JSON object with exactly two keys: \"data\" and \"confidence\". "
    "\"data\" contains these fields (use null when a value is not present in the "
    "document; never guess): " + ", ".join(EXTRACTED_FIELDS) + ". \"data\" also "
    "contains \"line_items\": an array of the contract's priced line items / "
    "rate-card rows, each an object with \"item\" (description), \"unit\" (the unit "
    "of measure the rate applies to, e.g. per licence/hour/month), \"quantity\", "
    "\"unit_rate\", and \"amount\" (the line total). Use an empty array when the "
    "document has no itemized pricing; use null for any line field not stated. "
    "\"data\" also contains \"contract_type\" (the single best-fitting document/"
    "contract category) and \"tags\" (an array of 2-5 short lowercase keyword "
    "labels describing the contract). "
    "\"confidence\" contains the scalar field names (not line_items or tags), each a "
    "number from 0 to 1 indicating your confidence in that value. Do not include any "
    "prose outside the JSON."
)


def clean_tags(raw) -> list:
    """Coerce the model's tags into a de-duplicated list of short label strings."""
    if not isinstance(raw, list):
        return []
    seen, out = set(), []
    for t in raw:
        if not isinstance(t, str):
            continue
        label = t.strip()[:80]
        key = label.lower()
        if label and key not in seen:
            seen.add(key)
            out.append(label)
    return out[:8]


def clean_line_items(raw) -> list:
    """Coerce the model's line_items into a list of {item, unit, quantity,
    unit_rate, amount} dicts, dropping empty rows and non-numeric numbers."""
    if not isinstance(raw, list):
        return []
    out = []
    for row in raw:
        if not isinstance(row, dict):
            continue
        item = (row.get("item") or "").strip() if isinstance(row.get("item"), str) else row.get("item")
        cleaned = {
            "item": item or None,
            "unit": (row.get("unit") or None),
            "quantity": _num(row.get("quantity")),
            "unit_rate": _num(row.get("unit_rate")),
            "amount": _num(row.get("amount")),
        }
        # Skip fully-empty rows (no description and no numbers)
        if cleaned["item"] or cleaned["unit_rate"] is not None or cleaned["amount"] is not None:
            out.append(cleaned)
    return out


def _num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def finalize_result(parsed: dict, model: str, usage: dict | None = None) -> dict:
    """Normalize a provider's parsed JSON into the worker's expected shape.

    `usage` is an optional {"input_tokens", "output_tokens"} dict captured from
    the provider response so token consumption can be recorded per file.
    """
    if not isinstance(parsed, dict) or "data" not in parsed:
        raise ExtractionError("Model response was not in the expected {data, confidence} shape")
    data = parsed.get("data") or {}
    if data.get("currency") in (None, ""):
        data["currency"] = "INR"
    data["line_items"] = clean_line_items(data.get("line_items"))
    data["tags"] = clean_tags(data.get("tags"))
    return {
        "data": data,
        "confidence": parsed.get("confidence", {}),
        "model": model,
        "usage": usage or {"input_tokens": None, "output_tokens": None},
    }


def usage_from(input_tokens, output_tokens) -> dict:
    """Coerce provider token counts to ints (or None)."""
    def _int(v):
        try:
            return int(v) if v is not None else None
        except (TypeError, ValueError):
            return None
    return {"input_tokens": _int(input_tokens), "output_tokens": _int(output_tokens)}


def parse_json(text: str) -> dict:
    """Parse a model's text response as JSON, tolerating markdown code fences."""
    text = (text or "").strip()
    if text.startswith("```"):
        # strip a leading ```json / ``` fence and trailing fence
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text[: -3]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ExtractionError(f"Model did not return valid JSON: {exc}") from exc


def retry_call(do_call, transient_types: tuple, provider: str):
    """Run `do_call` with exponential backoff on the given transient exception types.
    Non-transient errors (including ExtractionError) propagate immediately."""
    last_error = None
    for attempt in range(settings.EXTRACTION_MAX_RETRIES):
        try:
            return do_call()
        except transient_types as exc:
            last_error = exc
            wait = 2**attempt
            log.warning("%s transient error (attempt %d): %s — retrying in %ss",
                        provider, attempt + 1, exc, wait)
            time.sleep(wait)
    raise ExtractionError(
        f"{provider} failed after {settings.EXTRACTION_MAX_RETRIES} attempts: {last_error}"
    )
