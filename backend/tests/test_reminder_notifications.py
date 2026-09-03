"""The daily reminder run notifies the contract's assignee in-app."""
from datetime import date, timedelta


def test_daily_check_notifies_assignee(client, admin_headers):
    # a validator to own the contract
    email = "remind_owner@example.com"
    uid = client.post("/api/auth/users", headers=admin_headers,
                      json={"email": email, "name": "Owner", "password": "password123",
                            "role": "VALIDATOR"}).json()["id"]

    from app.database import SessionLocal
    from app.models import Contract, ContractStatus, LifecycleStatus, Notification
    from app.services.reminders import run_daily_check
    db = SessionLocal()
    c = Contract(vendor_name_raw="RemindMe", contract_service="svc",
                 status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
                 end_date=date.today() + timedelta(days=30), custom_offsets=[30],
                 assignee_id=uid, raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no

    # Pin "today" to the same reference used for end_date so the 30-day offset
    # matches regardless of the app timezone (Asia/Kolkata) vs. UTC date rollover.
    run_daily_check(db, today=date.today())
    notes = (
        db.query(Notification)
        .filter(Notification.user_id == uid, Notification.type == "reminder")
        .all()
    )
    db.close()
    assert any(f"#{sr}" in n.message and n.link == f"/contracts/{sr}" for n in notes)


class TestRemindersForUnvalidatedContracts:
    """Expiry reminders covered validated contracts only, so a contract sitting
    in the validation queue could pass its end date unremarked. Whether to
    remind from an unconfirmed date is a judgement call, so it is a setting."""

    def _pending(self, days=30, offsets=(30,)):
        from datetime import date, timedelta

        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, Department, LifecycleStatus
        import uuid
        db = SessionLocal()
        dept = Department(name=f"RemindDept-{uuid.uuid4().hex[:6]}",
                          default_recipient_email="dept@example.com")
        db.add(dept); db.flush()
        c = Contract(vendor_name_raw="Unvalidated Co", contract_service="svc",
                     status=ContractStatus.PENDING_VALIDATION,
                     lifecycle_status=LifecycleStatus.ACTIVE,
                     department_id=dept.id,
                     end_date=date.today() + timedelta(days=days),
                     custom_offsets=list(offsets), raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        return sr

    def _run(self, setting):
        from datetime import date

        from app.database import SessionLocal
        from app.models import ReminderLog
        from app.services.reminders import run_daily_check
        from app.services.settings_store import set_setting
        db = SessionLocal()
        set_setting(db, "reminders_include_unvalidated", setting)
        db.commit()
        run_daily_check(db, today=date.today())
        logs = db.query(ReminderLog).all()
        rows = [(row.contract_id, row.delivery_status) for row in logs]
        db.close()
        return rows

    def test_off_by_default(self, client, admin_headers):
        from app.services.settings_store import DEFAULTS
        assert DEFAULTS["reminders_include_unvalidated"] == "false"

    def test_unvalidated_contracts_are_skipped_when_off(self, client, admin_headers):
        sr = self._pending()
        rows = self._run("false")
        assert not any(cid == sr for cid, _ in rows)

    def test_unvalidated_contracts_are_reminded_when_on(self, client, admin_headers):
        sr = self._pending()
        rows = self._run("true")
        assert any(cid == sr for cid, _ in rows), rows

    def test_the_email_says_the_contract_is_unvalidated(self, client, admin_headers, monkeypatch):
        from datetime import date

        sent = []
        from app.services import notifications as N

        class _Cap:
            # Mirrors NotificationChannel.send, which now also carries the
            # contract document. A double that lags the interface makes the send
            # fail and the assertion below blame the wrong thing.
            def send(self, to, subject, body, cc=None, attachments=None):
                sent.append(body)
        monkeypatch.setitem(N.CHANNELS, "email", _Cap())

        sr = self._pending()
        from app.database import SessionLocal
        from app.services.reminders import run_daily_check
        from app.services.settings_store import set_setting
        db = SessionLocal()
        set_setting(db, "reminders_include_unvalidated", "true"); db.commit()
        run_daily_check(db, today=date.today())
        db.close()
        assert sent, "no reminder email was sent"
        assert any("has not been validated yet" in b for b in sent), sent[:1]
        assert sr

    def test_a_validated_contract_gets_no_such_warning(self, client, admin_headers, monkeypatch):
        from datetime import date, timedelta
        import uuid

        sent = []
        from app.services import notifications as N

        class _Cap:
            # Mirrors NotificationChannel.send, which now also carries the
            # contract document. A double that lags the interface makes the send
            # fail and the assertion below blame the wrong thing.
            def send(self, to, subject, body, cc=None, attachments=None):
                sent.append(body)
        monkeypatch.setitem(N.CHANNELS, "email", _Cap())

        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, Department, LifecycleStatus
        from app.services.reminders import run_daily_check
        db = SessionLocal()
        dept = Department(name=f"OkDept-{uuid.uuid4().hex[:6]}",
                          default_recipient_email="dept@example.com")
        db.add(dept); db.flush()
        db.add(Contract(vendor_name_raw="Validated Co", contract_service="svc",
                        status=ContractStatus.VALIDATED,
                        lifecycle_status=LifecycleStatus.ACTIVE, department_id=dept.id,
                        end_date=date.today() + timedelta(days=30), custom_offsets=[30],
                        raw_extracted={}, confidence={}))
        db.commit()
        run_daily_check(db, today=date.today())
        db.close()
        # Other contracts seeded by this class may also be due in the same run,
        # so check the body for THIS contract rather than every body sent.
        mine = [b for b in sent if "Validated Co" in b]
        assert mine, "no reminder email for the validated contract"
        assert not any("has not been validated yet" in b for b in mine)

    def test_rejected_and_archived_are_never_reminded(self, client, admin_headers):
        """Those are decisions to stop tracking a contract, not a backlog."""
        from datetime import date, timedelta
        import uuid

        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, LifecycleStatus, ReminderLog
        from app.services.reminders import run_daily_check
        from app.services.settings_store import set_setting
        db = SessionLocal()
        made = []
        for status in (ContractStatus.REJECTED, ContractStatus.ARCHIVED):
            c = Contract(vendor_name_raw=f"Gone-{uuid.uuid4().hex[:5]}", contract_service="svc",
                         status=status, lifecycle_status=LifecycleStatus.ACTIVE,
                         end_date=date.today() + timedelta(days=30), custom_offsets=[30],
                         raw_extracted={}, confidence={})
            db.add(c); db.flush(); made.append(c.sr_no)
        set_setting(db, "reminders_include_unvalidated", "true")
        db.commit()
        run_daily_check(db, today=date.today())
        ids = {row.contract_id for row in db.query(ReminderLog).all()}
        db.close()
        assert not (set(made) & ids)

    def test_the_digest_uses_the_same_scope(self, client, admin_headers):
        """The digest and the emails must not disagree about what is watched."""
        from datetime import date

        from app.database import SessionLocal
        from app.services.digest import build_digest
        from app.services.settings_store import set_setting
        sr = self._pending(days=10)
        db = SessionLocal()
        set_setting(db, "reminders_include_unvalidated", "false"); db.commit()
        off = build_digest(db, today=date.today())
        set_setting(db, "reminders_include_unvalidated", "true"); db.commit()
        on = build_digest(db, today=date.today())
        db.close()
        ids_off = {r["sr_no"] for r in off["expiring"]["rows"]}
        ids_on = {r["sr_no"] for r in on["expiring"]["rows"]}
        assert sr not in ids_off
        assert sr in ids_on
