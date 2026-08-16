"""Test CSV export of the reminder log."""
import csv
import io


class TestReminderLogExport:
    def _seed_log(self, contract_id, status="SENT", recipient="a@example.com"):
        from app.database import SessionLocal
        from app.models import ReminderLog
        db = SessionLocal()
        db.add(ReminderLog(contract_id=contract_id, recipient=recipient, channel="email",
                           days_to_expiry=30, delivery_status=status, detail="ok"))
        db.commit(); db.close()

    def _seed_contract(self):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="ReminderVendor", contract_service="svc",
                     status=ContractStatus.VALIDATED, raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        return sr

    def test_export_csv_shape_and_filters(self, client, admin_headers):
        sr = self._seed_contract()
        self._seed_log(sr, status="SENT")
        self._seed_log(sr, status="FAILED", recipient="b@example.com")

        r = client.get(f"/api/rules/reminder-log/export?contract_id={sr}", headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("text/csv")
        assert "reminder_log.csv" in r.headers["content-disposition"]

        reader = list(csv.DictReader(io.StringIO(r.text)))
        assert {row["recipient"] for row in reader} == {"a@example.com", "b@example.com"}
        assert reader[0]["vendor"] == "ReminderVendor"
        assert set(reader[0].keys()) >= {"contract_id", "recipient", "delivery_status", "sent_at"}

        # status filter narrows the export
        r2 = client.get(f"/api/rules/reminder-log/export?contract_id={sr}&status=FAILED",
                        headers=admin_headers)
        rows2 = list(csv.DictReader(io.StringIO(r2.text)))
        assert len(rows2) == 1 and rows2[0]["delivery_status"] == "FAILED"
