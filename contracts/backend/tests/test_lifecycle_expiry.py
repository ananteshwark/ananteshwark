"""R3 2.16: a validated contract expires as soon as its end date passes."""
from datetime import date, timedelta


def _seed(end_offset_days, custom_offsets=None):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus, LifecycleStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw="LC", contract_service="svc",
                 status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
                 end_date=date.today() + timedelta(days=end_offset_days),
                 custom_offsets=custom_offsets, raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no
    db.close()
    return sr


def test_detail_read_flips_expired_immediately(client, admin_headers):
    sr = _seed(end_offset_days=-1)  # ended yesterday, no reminder rule
    out = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
    assert out["lifecycle_status"] == "EXPIRED"


def test_active_contract_stays_active(client, admin_headers):
    sr = _seed(end_offset_days=10)
    out = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
    assert out["lifecycle_status"] == "ACTIVE"


def test_list_read_flips_expired(client, admin_headers):
    sr = _seed(end_offset_days=-3)
    items = client.get("/api/contracts", headers=admin_headers).json()["items"]
    row = next(i for i in items if i["sr_no"] == sr)
    assert row["lifecycle_status"] == "EXPIRED"


def test_daily_run_expires_without_reminder_rule():
    from app.database import SessionLocal
    from app.models import Contract, LifecycleStatus
    from app.services.reminders import run_daily_check
    sr = _seed(end_offset_days=-5)  # no custom_offsets -> reminder loop would skip it
    db = SessionLocal()
    run_daily_check(db, today=date.today())
    c = db.get(Contract, sr)
    assert c.lifecycle_status == LifecycleStatus.EXPIRED
    db.close()
