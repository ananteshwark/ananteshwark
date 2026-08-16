"""Tests for per-file token-usage tracking."""
from app.services.extraction_common import finalize_result, usage_from


def test_usage_from_coerces_and_tolerates_bad_values():
    assert usage_from(10, 20) == {"input_tokens": 10, "output_tokens": 20}
    assert usage_from(None, "5") == {"input_tokens": None, "output_tokens": 5}
    assert usage_from("bad", None) == {"input_tokens": None, "output_tokens": None}


def test_finalize_result_carries_usage():
    out = finalize_result({"data": {"vendor": "V"}, "confidence": {}}, "m", {"input_tokens": 3, "output_tokens": 7})
    assert out["usage"] == {"input_tokens": 3, "output_tokens": 7}
    # default when omitted
    assert finalize_result({"data": {}}, "m")["usage"] == {"input_tokens": None, "output_tokens": None}


class TestTokenUsageApi:
    def _ingestion_with_tokens(self, inp, out, status="PENDING_VALIDATION"):
        from app.database import SessionLocal
        from app.models import IngestionFile, IngestionStatus
        db = SessionLocal()
        f = IngestionFile(path="/x/a.pdf", filename="a.pdf", sha256="h" * 64, size_bytes=10,
                          status=IngestionStatus(status), input_tokens=inp, output_tokens=out)
        db.add(f); db.commit(); fid = f.id; db.close()
        return fid

    def test_per_file_tokens_in_listing(self, client, admin_headers):
        fid = self._ingestion_with_tokens(120, 30)
        items = client.get("/api/ingestion?limit=500", headers=admin_headers).json()["items"]
        row = next(r for r in items if r["id"] == fid)
        assert row["input_tokens"] == 120 and row["output_tokens"] == 30
        assert row["total_tokens"] == 150

    def test_token_usage_aggregate(self, client, admin_headers):
        before = client.get("/api/ingestion/token-usage", headers=admin_headers).json()
        self._ingestion_with_tokens(200, 50)
        after = client.get("/api/ingestion/token-usage", headers=admin_headers).json()
        assert after["total_tokens"] == before["total_tokens"] + 250
        assert after["files_processed"] == before["files_processed"] + 1

    def test_unprocessed_file_has_null_tokens(self, client, admin_headers):
        fid = self._ingestion_with_tokens(None, None, status="QUEUED")
        items = client.get("/api/ingestion?limit=500", headers=admin_headers).json()["items"]
        row = next(r for r in items if r["id"] == fid)
        assert row["total_tokens"] is None
