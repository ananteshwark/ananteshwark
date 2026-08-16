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
