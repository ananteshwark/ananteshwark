from datetime import date

from app.services.reminders import is_reminder_due, upcoming_reminder_dates

OFFSETS = [90, 60, 30, 15, 7, 1]


class TestUpcomingReminderDates:
    def test_lists_offset_dates_before_expiry(self):
        end = date(2025, 12, 31)
        dates = upcoming_reminder_dates(end, [90, 30, 7], from_date=date(2025, 1, 1))
        # 90/30/7 days before 2025-12-31
        assert date(2025, 10, 2) in dates   # 90 days before
        assert date(2025, 12, 1) in dates   # 30 days before
        assert date(2025, 12, 24) in dates  # 7 days before
        assert dates == sorted(dates)

    def test_only_future_dates_from_from_date(self):
        end = date(2025, 12, 31)
        dates = upcoming_reminder_dates(end, [90, 30, 7], from_date=date(2025, 12, 10))
        # the 90-day mark already passed
        assert all(d >= date(2025, 12, 10) for d in dates)
        assert date(2025, 12, 24) in dates

    def test_periodicity_included(self):
        end = date(2025, 12, 31)
        dates = upcoming_reminder_dates(end, [90], periodicity_days=7, from_date=date(2025, 1, 1))
        assert len(dates) > 1  # 90, then every 7 days until expiry

    def test_post_expiry_dates(self):
        end = date(2025, 6, 1)
        dates = upcoming_reminder_dates(end, [7], post_expiry_days=7, from_date=date(2025, 5, 1))
        assert any(d > end for d in dates)  # continues past expiry

    def test_empty_when_no_offsets_or_end(self):
        assert upcoming_reminder_dates(date(2025, 1, 1), []) == []
        assert upcoming_reminder_dates(None, [30]) == []


class TestExplicitOffsets:
    def test_fires_on_each_offset(self):
        for offset in OFFSETS:
            assert is_reminder_due(offset, OFFSETS)

    def test_silent_between_offsets_without_periodicity(self):
        assert not is_reminder_due(45, OFFSETS)
        assert not is_reminder_due(89, OFFSETS)
        assert not is_reminder_due(2, OFFSETS)

    def test_silent_before_first_offset(self):
        assert not is_reminder_due(120, OFFSETS)

    def test_empty_offsets_never_fire(self):
        assert not is_reminder_due(30, [])

    def test_offset_zero_day_of_expiry(self):
        assert is_reminder_due(0, [0])
        assert not is_reminder_due(0, OFFSETS)


class TestPeriodicity:
    def test_every_7_days_after_first_trigger(self):
        # First trigger at 90; then every 7 days: 83, 76, 69, ...
        assert is_reminder_due(83, OFFSETS, periodicity_days=7)
        assert is_reminder_due(76, OFFSETS, periodicity_days=7)
        assert not is_reminder_due(84, OFFSETS, periodicity_days=7)

    def test_periodicity_does_not_fire_before_first_offset(self):
        assert not is_reminder_due(97, OFFSETS, periodicity_days=7)

    def test_explicit_offsets_still_fire_with_periodicity(self):
        assert is_reminder_due(60, OFFSETS, periodicity_days=7)


class TestPostExpiry:
    def test_fires_every_n_days_after_expiry(self):
        assert is_reminder_due(-7, OFFSETS, post_expiry_days=7)
        assert is_reminder_due(-14, OFFSETS, post_expiry_days=7)
        assert not is_reminder_due(-8, OFFSETS, post_expiry_days=7)

    def test_no_post_expiry_configured_stays_silent(self):
        assert not is_reminder_due(-7, OFFSETS)
        assert not is_reminder_due(-30, OFFSETS, periodicity_days=7)


class TestRunDailyCheckIntegration:
    """End-to-end check of rule resolution + sending with an in-memory DB."""

    def _setup(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker

        from app.database import Base
        from app import models

        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        Session = sessionmaker(bind=engine)
        return Session(), models

    def test_reminder_sent_and_logged(self):
        from datetime import date, timedelta

        from app.services.reminders import run_daily_check

        db, m = self._setup()
        dept = m.Department(name="IT", default_recipient_email="it-head@example.com")
        db.add(dept)
        db.flush()
        rule = m.ReminderRule(name="Standard", offsets=[30, 7])
        db.add(rule)
        db.flush()
        db.add(m.RuleDepartmentMap(rule_id=rule.id, department_id=dept.id))
        today = date(2025, 6, 1)
        contract = m.Contract(
            signing_entity="IKS",
            vendor_name_raw="Acme",
            department_id=dept.id,
            end_date=today + timedelta(days=30),
            status=m.ContractStatus.VALIDATED,
        )
        db.add(contract)
        db.commit()

        fired = run_daily_check(db, today=today)
        assert fired == 1
        logs = db.query(m.ReminderLog).all()
        assert len(logs) == 1
        assert logs[0].recipient == "it-head@example.com"
        assert logs[0].days_to_expiry == 30

    def test_terminated_contract_not_reminded(self):
        from datetime import date, timedelta

        from app.services.reminders import run_daily_check

        db, m = self._setup()
        rule = m.ReminderRule(name="Standard", offsets=[30])
        db.add(rule)
        today = date(2025, 6, 1)
        contract = m.Contract(
            vendor_name_raw="Acme",
            end_date=today + timedelta(days=30),
            status=m.ContractStatus.VALIDATED,
            lifecycle_status=m.LifecycleStatus.TERMINATED,
            custom_offsets=[30],
        )
        db.add(contract)
        db.commit()
        assert run_daily_check(db, today=today) == 0

    def test_contract_custom_offsets_override_rule(self):
        from datetime import date, timedelta

        from app.services.reminders import run_daily_check

        db, m = self._setup()
        today = date(2025, 6, 1)
        contract = m.Contract(
            vendor_name_raw="Acme",
            end_date=today + timedelta(days=45),
            status=m.ContractStatus.VALIDATED,
            custom_offsets=[45],
        )
        db.add(contract)
        db.add(m.ContractRecipient(contract_id=1, name="Owner", email="owner@example.com", is_primary=True))
        db.commit()
        assert run_daily_check(db, today=today) == 1

    def test_contract_escalation_override_wins_over_rule(self):
        """Per-contract escalation_after/email overrides the resolved rule's values."""
        from app.services.reminders import send_contract_reminder

        db, m = self._setup()
        rule = m.ReminderRule(
            name="Standard", offsets=[30],
            escalation_after=5, escalation_email="rule-cfo@example.com",
        )
        db.add(rule)
        db.flush()
        contract = m.Contract(
            vendor_name_raw="Acme",
            status=m.ContractStatus.VALIDATED,
        )
        db.add(contract)
        db.flush()
        contract.escalation_after = 2
        contract.escalation_email = "contract-owner@example.com"
        db.add(m.ContractRecipient(
            contract_id=contract.sr_no, name="Owner", email="owner@example.com", is_primary=True,
        ))
        # Two prior SENT reminders — meets the contract-level threshold of 2 (rule's is 5)
        for _ in range(2):
            db.add(m.ReminderLog(
                contract_id=contract.sr_no, recipient="owner@example.com",
                days_to_expiry=30, delivery_status="SENT",
            ))
        db.commit()

        send_contract_reminder(db, contract, rule, days_remaining=7)
        db.commit()
        last = (
            db.query(m.ReminderLog)
            .order_by(m.ReminderLog.id.desc())
            .first()
        )
        assert last.escalated is True

    def test_no_escalation_before_contract_threshold(self):
        from app.services.reminders import send_contract_reminder

        db, m = self._setup()
        contract = m.Contract(vendor_name_raw="Acme", status=m.ContractStatus.VALIDATED)
        db.add(contract)
        db.flush()
        contract.escalation_after = 3
        contract.escalation_email = "contract-owner@example.com"
        db.add(m.ContractRecipient(
            contract_id=contract.sr_no, name="Owner", email="owner@example.com", is_primary=True,
        ))
        # Only one prior SENT reminder — below the threshold of 3
        db.add(m.ReminderLog(
            contract_id=contract.sr_no, recipient="owner@example.com",
            days_to_expiry=30, delivery_status="SENT",
        ))
        db.commit()

        send_contract_reminder(db, contract, None, days_remaining=7)
        db.commit()
        last = db.query(m.ReminderLog).order_by(m.ReminderLog.id.desc()).first()
        assert last.escalated is False
