"""Tests for the multi-provider extraction dispatcher."""
import pytest

from app.services import extraction
from app.services.extraction_common import (
    ExtractionError,
    finalize_result,
    parse_json,
)


def _set_provider(client, admin_headers, values):
    r = client.put("/api/settings", headers=admin_headers, json={"values": values})
    assert r.status_code == 200, r.text


class TestDispatch:
    def _patch_backends(self, monkeypatch):
        calls = {}

        def make(name):
            def backend(prompt, model, api_key):
                calls["provider"] = name
                calls["model"] = model
                calls["api_key"] = api_key
                calls["prompt"] = prompt
                return {"data": {"vendor": "X"}, "confidence": {}, "model": model}
            return backend

        monkeypatch.setattr("app.services.claude_extractor.run_claude", make("claude"))
        monkeypatch.setattr("app.services.openai_extractor.run_openai", make("openai"))
        monkeypatch.setattr("app.services.gemini_extractor.run_gemini", make("gemini"))
        return calls

    def test_selects_openai_with_its_key_and_model(self, client, admin_headers, monkeypatch):
        calls = self._patch_backends(monkeypatch)
        _set_provider(client, admin_headers, {
            "extraction_provider": "openai",
            "openai_api_key": "sk-test",
            "openai_model": "gpt-4o-mini",
        })
        out = extraction.extract_contract_data("DOC TEXT", "Extract: {document_text}")
        assert calls["provider"] == "openai"
        assert calls["model"] == "gpt-4o-mini"
        assert calls["api_key"] == "sk-test"
        assert "DOC TEXT" in calls["prompt"]
        assert out["data"]["vendor"] == "X"

    def test_secondary_provider_used_when_requested(self, client, admin_headers, monkeypatch):
        calls = self._patch_backends(monkeypatch)
        _set_provider(client, admin_headers, {
            "extraction_provider": "claude",
            "secondary_extraction_enabled": "true",
            "secondary_extraction_provider": "gemini",
            "gemini_api_key": "AIza-2nd", "gemini_model": "gemini-2.5-pro",
        })
        # primary path -> claude
        extraction.extract_contract_data("D", "{document_text}")
        assert calls["provider"] == "claude"
        # secondary path -> gemini with its own model/key
        extraction.extract_contract_data("D", "{document_text}", use_secondary=True)
        assert calls["provider"] == "gemini" and calls["model"] == "gemini-2.5-pro"
        assert calls["api_key"] == "AIza-2nd"
        _set_provider(client, admin_headers, {"extraction_provider": "claude"})

    def test_selects_gemini(self, client, admin_headers, monkeypatch):
        calls = self._patch_backends(monkeypatch)
        _set_provider(client, admin_headers, {
            "extraction_provider": "gemini", "gemini_api_key": "AIza-test", "gemini_model": "gemini-1.5-flash",
        })
        extraction.extract_contract_data("D", "{document_text}")
        assert calls["provider"] == "gemini" and calls["model"] == "gemini-1.5-flash"

    def test_selects_custom_with_base_url(self, client, admin_headers, monkeypatch):
        calls = {}

        def backend(prompt, model, api_key, base_url):
            calls.update(provider="custom", model=model, api_key=api_key,
                         base_url=base_url, prompt=prompt)
            return {"data": {"vendor": "X"}, "confidence": {}, "model": model}

        monkeypatch.setattr("app.services.custom_extractor.run_custom", backend)
        _set_provider(client, admin_headers, {
            "extraction_provider": "custom",
            "custom_api_base": "http://localhost:8000/v1",
            "custom_api_key": "local-key",
            "custom_model": "my-slm-7b",
        })
        out = extraction.extract_contract_data("DOC TEXT", "{document_text}")
        assert calls["provider"] == "custom"
        assert calls["base_url"] == "http://localhost:8000/v1"
        assert calls["model"] == "my-slm-7b"
        assert calls["api_key"] == "local-key"
        assert "DOC TEXT" in calls["prompt"]
        assert out["data"]["vendor"] == "X"
        # reset for other tests
        _set_provider(client, admin_headers, {"extraction_provider": "claude"})

    def test_defaults_to_claude_for_unknown_provider(self, client, admin_headers, monkeypatch):
        calls = self._patch_backends(monkeypatch)
        _set_provider(client, admin_headers, {"extraction_provider": "bogus"})
        extraction.extract_contract_data("D", "{document_text}")
        assert calls["provider"] == "claude"
        # reset for other tests
        _set_provider(client, admin_headers, {"extraction_provider": "claude"})

    def test_masks_all_provider_keys(self, client, admin_headers):
        _set_provider(client, admin_headers, {
            "openai_api_key": "sk-secret", "gemini_api_key": "AIza-secret",
            "custom_api_key": "local-secret",
        })
        got = client.get("/api/settings", headers=admin_headers).json()
        assert got["openai_api_key"] == "********"
        assert got["gemini_api_key"] == "********"
        assert got["custom_api_key"] == "********"


class TestRegisterFields:
    def test_payment_term_and_notice_period_are_extracted_fields(self):
        from app.services.extraction_common import EXTRACTED_FIELDS, EXTRACTION_SCHEMA

        for field in ("payment_term", "notice_period"):
            assert field in EXTRACTED_FIELDS
            assert field in EXTRACTION_SCHEMA["properties"]["data"]["properties"]
            assert field in EXTRACTION_SCHEMA["properties"]["data"]["required"]

    def test_contract_type_and_tags_in_schema(self):
        from app.services.extraction_common import EXTRACTION_SCHEMA, EXTRACTED_FIELDS, clean_tags
        data = EXTRACTION_SCHEMA["properties"]["data"]
        assert "contract_type" in EXTRACTED_FIELDS  # scalar → gets a confidence
        assert data["properties"]["contract_type"]["type"] == ["string", "null"]
        assert data["properties"]["tags"]["type"] == "array"
        assert "tags" in data["required"] and "contract_type" in data["required"]
        # tags cleaner dedupes (case-insensitive), trims, and caps
        assert clean_tags(["Legal", "legal", " urgent ", 5, ""]) == ["Legal", "urgent"]

    def test_new_fields_round_trip_through_update_and_serializer(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus

        db = SessionLocal()
        c = Contract(vendor_name_raw="TermVendor", status=ContractStatus.PENDING_VALIDATION,
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()

        r = client.put(f"/api/contracts/{sr}", headers=admin_headers,
                       json={"payment_term": "Net 30", "notice_period": "90 days"})
        assert r.status_code == 200, r.text
        got = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
        assert got["payment_term"] == "Net 30"
        assert got["notice_period"] == "90 days"


class TestLineItems:
    def test_schema_has_line_items_array_and_cleaner(self):
        from app.services.extraction_common import EXTRACTION_SCHEMA, clean_line_items
        data = EXTRACTION_SCHEMA["properties"]["data"]
        assert data["properties"]["line_items"]["type"] == "array"
        assert "line_items" in data["required"]
        # confidence stays keyed by scalar fields only
        assert "line_items" not in EXTRACTION_SCHEMA["properties"]["confidence"]["properties"]
        rows = clean_line_items([
            {"item": "Licence", "unit": "per seat", "quantity": "10", "unit_rate": "100", "amount": "1000"},
            {"item": "  ", "unit_rate": None, "amount": None},   # empty → dropped
        ])
        assert len(rows) == 1
        assert rows[0]["quantity"] == 10.0 and rows[0]["unit_rate"] == 100.0

    def test_line_items_round_trip(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="LineVendor", status=ContractStatus.PENDING_VALIDATION,
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        items = [{"item": "Annual licence", "unit": "per seat", "quantity": 5, "unit_rate": 200, "amount": 1000}]
        r = client.put(f"/api/contracts/{sr}", headers=admin_headers, json={"line_items": items})
        assert r.status_code == 200, r.text
        got = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
        assert got["line_items"][0]["unit_rate"] == 200

    def test_vendor_year_on_year_rate_history(self):
        import datetime
        from types import SimpleNamespace
        from app.api.vendors_api import _line_item_rate_history
        contracts = [
            SimpleNamespace(start_date=datetime.date(2023, 1, 1),
                            line_items=[{"item": "Annual Licence", "unit": "per seat", "unit_rate": 100}]),
            SimpleNamespace(start_date=datetime.date(2024, 1, 1),
                            line_items=[{"item": "annual licence", "unit": "per seat", "unit_rate": 120}]),
        ]
        hist = _line_item_rate_history(contracts)
        assert len(hist) == 1  # matched across years by normalized name
        h = hist[0]
        assert h["rates_by_year"] == {"2023": 100.0, "2024": 120.0}
        assert h["latest_pct_change"] == 20.0
        assert h["changes"][0]["pct_change"] == 20.0


class TestTenure:
    def test_tenure_from_dates_months_and_years(self):
        import datetime
        from app.services.dates import tenure_from_dates
        assert tenure_from_dates(datetime.date(2025, 1, 1), datetime.date(2025, 12, 31)) == "1 Year"
        assert tenure_from_dates(datetime.date(2025, 1, 1), datetime.date(2027, 12, 31)) == "3 Years"
        assert tenure_from_dates(datetime.date(2025, 1, 1), datetime.date(2026, 6, 30)) == "18 Months"
        assert tenure_from_dates(None, datetime.date(2025, 1, 1)) is None

    def test_normalize_tenure_to_months_or_years(self):
        from app.services.dates import normalize_tenure
        assert normalize_tenure("24 months") == "2 Years"
        assert normalize_tenure("18 months") == "18 Months"
        assert normalize_tenure("1.5 years") == "18 Months"
        assert normalize_tenure("banana") is None


class TestClaudeBackend:
    def test_run_claude_parses_fenced_json_without_strict_schema(self, monkeypatch):
        """Claude no longer sends output_config json_schema (union-param limit);
        it must parse the fenced JSON from the prompt-instructed response."""
        from app.services import claude_extractor as ce

        class _Usage:
            input_tokens = 10
            output_tokens = 5

        class _Block:
            type = "text"
            text = ('```json\n{"data": {"vendor": "V", "line_items": '
                    '[{"item": "Lic", "unit_rate": 100}]}, '
                    '"confidence": {"vendor": 0.9}}\n```')

        class _Resp:
            stop_reason = "end_turn"
            model = "claude-x"
            usage = _Usage()
            content = [_Block()]

        class _Stream:
            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def get_final_message(self):
                return _Resp()

        class _Client:
            class messages:
                @staticmethod
                def stream(**kw):
                    assert "output_config" not in kw  # strict schema no longer sent
                    return _Stream()

        monkeypatch.setattr(ce, "_client", lambda key: _Client())
        out = ce.run_claude("prompt", "claude-x", "sk-test")
        assert out["data"]["vendor"] == "V"
        assert out["data"]["line_items"][0]["unit_rate"] == 100.0
        assert out["data"]["currency"] == "INR"          # defaulted by finalize
        assert out["usage"]["input_tokens"] == 10


class TestCommonHelpers:
    def test_parse_json_strips_code_fence(self):
        assert parse_json('```json\n{"a": 1}\n```') == {"a": 1}
        assert parse_json('{"a": 2}') == {"a": 2}

    def test_parse_json_invalid_raises(self):
        with pytest.raises(ExtractionError):
            parse_json("not json")

    def test_finalize_defaults_currency_and_validates_shape(self):
        out = finalize_result({"data": {"vendor": "V"}, "confidence": {"vendor": 0.9}}, "m1")
        assert out["data"]["currency"] == "INR" and out["model"] == "m1"
        with pytest.raises(ExtractionError):
            finalize_result({"nope": 1}, "m1")
