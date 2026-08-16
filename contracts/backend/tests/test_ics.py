"""Tests for iCalendar export of contract expirations."""
from datetime import date, datetime, timezone

from app.services.ics import _escape, _fold, build_calendar


def test_escape_special_chars():
    assert _escape("a,b;c\\d\ne") == "a\\,b\\;c\\\\d\\ne"


def test_fold_long_line_wraps_with_leading_space():
    line = "X" * 200
    folded = _fold(line)
    parts = folded.split("\r\n ")
    assert len(parts) > 1
    assert all(len(p.encode("utf-8")) <= 75 for p in parts)


def test_build_calendar_structure():
    now = datetime(2026, 7, 25, tzinfo=timezone.utc)
    cal = build_calendar([
        {"uid": "contract-1-expiry@cms", "date": date(2026, 4, 1),
         "summary": "Contract expires: Acme (#1)", "description": "Contract #1\nService: hosting"},
    ], now=now)
    assert cal.startswith("BEGIN:VCALENDAR\r\n")
    assert cal.endswith("END:VCALENDAR\r\n")
    assert "BEGIN:VEVENT" in cal and "END:VEVENT" in cal
    assert "UID:contract-1-expiry@cms" in cal
    assert "DTSTART;VALUE=DATE:20260401" in cal
    assert "DTEND;VALUE=DATE:20260402" in cal  # all-day, exclusive end
    assert "DTSTAMP:20260725T000000Z" in cal
    # newline in description is escaped
    assert "DESCRIPTION:Contract #1\\nService: hosting" in cal


def test_empty_calendar_has_no_events():
    cal = build_calendar([])
    assert "BEGIN:VEVENT" not in cal
    assert "BEGIN:VCALENDAR" in cal and "END:VCALENDAR" in cal


class TestCalendarEndpoint:
    def test_ics_endpoint(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="CalendarVendor", contract_service="svc",
                     status=ContractStatus.VALIDATED, end_date=date(2027, 3, 15),
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()

        r = client.get("/api/contracts/calendar.ics", headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("text/calendar")
        assert "contract_expirations.ics" in r.headers["content-disposition"]
        body = r.text
        assert "BEGIN:VCALENDAR" in body
        assert f"UID:contract-{sr}-expiry@cms" in body
        assert "DTSTART;VALUE=DATE:20270315" in body
        assert "CalendarVendor" in body
