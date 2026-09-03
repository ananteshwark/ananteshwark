"""Seed the database with an admin user, departments, rules and demo data.

Usage:  cd backend && python -m scripts.seed
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.main import ensure_default_prompt
from app.models import (
    Department,
    EmailTemplate,
    ReminderRule,
    RuleDepartmentMap,
    User,
    UserRole,
    Vendor,
    VendorAlias,
)
from app.services.reminders import DEFAULT_TEMPLATE_BODY, DEFAULT_TEMPLATE_SUBJECT
from app.services.vendor_matching import normalize_vendor_name


def seed():
    Base.metadata.create_all(bind=engine)
    ensure_default_prompt()
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            db.add_all([
                User(email="admin@example.com", name="Administrator",
                     hashed_password=hash_password("admin12345"), role=UserRole.ADMIN),
                User(email="validator@example.com", name="Vera Validator",
                     hashed_password=hash_password("validator123"), role=UserRole.VALIDATOR),
                User(email="viewer@example.com", name="Victor Viewer",
                     hashed_password=hash_password("viewer12345"), role=UserRole.VIEWER),
            ])
            print("Users: admin@example.com/admin12345, validator@example.com/validator123, viewer@example.com/viewer12345")

        if db.query(Department).count() == 0:
            departments = [
                Department(name="IT", default_recipient_email="it-contracts@example.com"),
                Department(name="Finance", default_recipient_email="finance-contracts@example.com"),
                Department(name="Operations", default_recipient_email="ops-contracts@example.com"),
                Department(name="Human Resources"),
                Department(name="Legal"),
            ]
            db.add_all(departments)
            db.flush()

            rule = ReminderRule(
                name="Standard 90/60/30",
                offsets=[90, 60, 30, 15, 7, 1],
                periodicity_days=7,
                post_expiry_days=7,
                escalation_after=3,
                escalation_email="cfo@example.com",
                channels=["email"],
            )
            db.add(rule)
            db.flush()
            for dept in departments[:3]:
                db.add(RuleDepartmentMap(rule_id=rule.id, department_id=dept.id))
            print("Departments and 'Standard 90/60/30' reminder rule created")

        if db.query(Vendor).count() == 0:
            acme = Vendor(name="Acme Technologies Pvt Ltd",
                          normalized_name=normalize_vendor_name("Acme Technologies Pvt Ltd"),
                          addresses=["12 MG Road, Bengaluru 560001"],
                          contacts=[{"name": "R. Sharma", "email": "sales@acme.example.com"}])
            db.add(acme)
            db.flush()
            db.add(VendorAlias(vendor_id=acme.id, alias="ACME Tech",
                               normalized_alias=normalize_vendor_name("ACME Tech")))
            db.add(Vendor(name="Zenith Facility Services LLP",
                          normalized_name=normalize_vendor_name("Zenith Facility Services LLP")))
            print("Sample vendors created")

        if db.query(EmailTemplate).count() == 0:
            db.add(EmailTemplate(name="expiry_reminder",
                                 subject=DEFAULT_TEMPLATE_SUBJECT,
                                 body=DEFAULT_TEMPLATE_BODY))

        db.commit()
        print("Seed complete.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
