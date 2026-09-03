"""Tests for the scheduled digest email (build/render pure logic + API)."""
from datetime import date, timedelta

from app.services.digest import has_content, render_digest


def _summary(pending=0, expiring=0, failed=0):
    return {
        "date": date(2025, 6, 1),
        "pending": {"total": pending, "rows": [
            {"sr_no": i + 1, "vendor": f"V{i}", "service": "svc"} for i in range(min(pending, 3))
        ]},
        "expiring": {"total": expiring, "horizon_days": 30, "rows": [
            {"sr_no": 100 + i, "vendor": f"E{i}", "department": "Legal",
             "end_date": date(2025, 6, 10), "days_remaining": 9}
            for i in range(min(expiring, 3))
        ]},
        "failed": {"total": failed, "rows": [
            {"filename": f"f{i}.pdf", "error": "boom"} for i in range(min(failed, 3))
        ]},
    }


def test_has_content_only_true_when_something_present():
    assert has_content(_summary()) is False
    assert has_content(_summary(pending=1)) is True
    assert has_content(_summary(expiring=1)) is True
    assert has_content(_summary(failed=1)) is True


def test_digest_includes_milestones_section():
    s = _summary()
    s["milestones"] = {"total": 2, "horizon_days": 30, "rows": [
        {"sr_no": 7, "vendor": "Acme", "title": "Submit report", "due_date": date(2025, 6, 5), "overdue": False},
    ]}
    assert has_content(s) is True
    _, body = render_digest(s, base_url="https://cms.example.com")
    assert "Obligations due within 30 days" in body
    assert "Submit report" in body and "https://cms.example.com/contracts/7" in body


def test_render_digest_subject_carries_counts():
    subject, body = render_digest(_summary(pending=2, expiring=4, failed=1),
                                  base_url="https://cms.example.com")
    assert "2 pending" in subject and "4 expiring" in subject and "1 failed" in subject
    # links point at the configured base url, not a trailing slash
    assert "https://cms.example.com/contracts/1" in body
    # the truncation note appears when total exceeds the shown rows
    assert "and 1 more" in body  # 4 expiring, only 3 rows shown


def test_render_digest_empty_sections_say_none():
    _, body = render_digest(_summary())
    assert body.count("None.") == 4  # pending, expiring, obligations, failed


class TestDigestApi:
    def test_digest_now_forces_send_and_reports_counts(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, LifecycleStatus
        db = SessionLocal()
        db.add(Contract(vendor_name_raw="DigestPending", contract_service="svc",
                        status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={}))
        db.add(Contract(vendor_name_raw="DigestExpiring", contract_service="svc",
                        status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
                        end_date=date.today() + timedelta(days=10), raw_extracted={}, confidence={}))
        db.commit(); db.close()

        r = client.post("/api/settings/digest-now", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        # dry-run email in tests: it still counts as "sent" (logged, not skipped)
        assert body["sent"] is True
        assert body["summary"]["pending"] >= 1
        assert body["summary"]["expiring"] >= 1
        assert body["dry_run"] is True

    def test_system_status_reports_services(self, client, admin_headers):
        r = client.get("/api/settings/system-status", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        # background services are off in tests (CMS_BACKGROUND_SERVICES=false),
        # but the shape must be present for the admin panel
        for key in ("watcher", "gdrive", "digest", "jobs"):
            assert key in body
        assert isinstance(body["jobs"], list)
        assert "enabled" in body["watcher"] and "running" in body["watcher"]
