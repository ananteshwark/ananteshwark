"""Tests for reminder snooze."""
from datetime import date, timedelta


class TestSnooze:
    def _validated_contract(self, offsets=(30,), end_days=30):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, LifecycleStatus
        db = SessionLocal()
        c = Contract(
            vendor_name_raw="SnoozeVendor", contract_service="svc",
            status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
            end_date=date.today() + timedelta(days=end_days), custom_offsets=list(offsets),
            raw_extracted={}, confidence={},
        )
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        return sr

    def test_snooze_by_days_and_clear(self, client, admin_headers):
        sr = self._validated_contract()
        r = client.post(f"/api/contracts/{sr}/snooze-reminders", headers=admin_headers, json={"days": 10})
        assert r.status_code == 200
        expected = (date.today() + timedelta(days=10)).isoformat()
        assert r.json()["reminders_snoozed_until"] == expected

        sched = client.get(f"/api/contracts/{sr}/reminder-schedule", headers=admin_headers).json()
        assert sched["snoozed_until"] == expected

        # clear
        r2 = client.post(f"/api/contracts/{sr}/snooze-reminders", headers=admin_headers, json={})
        assert r2.json()["reminders_snoozed_until"] is None

    def test_snooze_until_explicit_date(self, client, admin_headers):
        sr = self._validated_contract()
        target = (date.today() + timedelta(days=45)).isoformat()
        r = client.post(f"/api/contracts/{sr}/snooze-reminders", headers=admin_headers, json={"until": target})
        assert r.json()["reminders_snoozed_until"] == target

    def test_past_date_rejected(self, client, admin_headers):
        sr = self._validated_contract()
        past = (date.today() - timedelta(days=1)).isoformat()
        assert client.post(f"/api/contracts/{sr}/snooze-reminders", headers=admin_headers,
                           json={"until": past}).status_code == 400

    def test_daily_check_skips_snoozed(self):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, LifecycleStatus, ReminderLog
        from app.services.reminders import run_daily_check
        db = SessionLocal()
        # a contract due for a reminder today (offset 30, end in 30 days)
        c = Contract(vendor_name_raw="SnoozeDue", contract_service="svc",
                     status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
                     end_date=date.today() + timedelta(days=30), custom_offsets=[30],
                     reminders_snoozed_until=date.today() + timedelta(days=5),
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no

        run_daily_check(db)
        fired = db.query(ReminderLog).filter(ReminderLog.contract_id == sr).count()
        db.close()
        assert fired == 0  # snoozed, so no reminder logged
