"""E2/G16 — legal hold (edit/delete/purge lock) + field-level edit permissions."""
import uuid

import pytest


def _seed():
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"LH-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 status=ContractStatus.VALIDATED, contract_value=100000, currency="INR",
                 extracted_text="x", raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


@pytest.fixture
def validator_headers(client):
    from app.auth import hash_password
    from app.database import SessionLocal
    from app.models import User, UserRole
    db = SessionLocal()
    if not db.query(User).filter(User.email == "val@example.com").first():
        db.add(User(email="val@example.com", name="Val", role=UserRole.VALIDATOR,
                    hashed_password=hash_password("validate123")))
        db.commit()
    db.close()
    r = client.post("/api/auth/login", json={"email": "val@example.com", "password": "validate123"})
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_legal_hold_locks_edit_and_delete(client, admin_headers, super_admin_headers):
    sr = _seed()
    held = client.post(f"/api/contracts/{sr}/legal-hold", headers=admin_headers,
                       json={"reason": "Litigation X"}).json()
    assert held["legal_hold"] is True and held["legal_hold_reason"] == "Litigation X"

    # edits are locked (423)
    assert client.put(f"/api/contracts/{sr}", headers=admin_headers,
                      json={"notice_period": "45 days"}).status_code == 423
    # deletion is locked (423) even for super admin
    assert client.delete(f"/api/contracts/{sr}", headers=super_admin_headers).status_code == 423

    # release, then edit + delete work again
    rel = client.delete(f"/api/contracts/{sr}/legal-hold", headers=admin_headers).json()
    assert rel["legal_hold"] is False
    assert client.put(f"/api/contracts/{sr}", headers=admin_headers,
                      json={"notice_period": "45 days"}).status_code == 200


def test_legal_hold_covers_every_write_path(client, admin_headers):
    """A hold preserves the record, so it has to cover more than edit + delete.

    Validation in particular writes fields through the same path as an edit and
    previously slipped straight past the guard.
    """
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"H-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 status=ContractStatus.PENDING_VALIDATION, notice_period="30 days",
                 raw_extracted={}, confidence={}, extracted_text="x")
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    client.post(f"/api/contracts/{sr}/legal-hold", headers=admin_headers, json={"reason": "litigation"})

    ent = f"Ent {uuid.uuid4().hex[:5]} Limited"
    client.post("/api/internal-entities", headers=admin_headers, json={"name": ent})
    dept = client.post("/api/departments", headers=admin_headers,
                       json={"name": f"D{uuid.uuid4().hex[:4]}"}).json()

    blocked = {
        "validate": client.post(f"/api/contracts/{sr}/validate", headers=admin_headers, json={
            "signing_entity": ent, "department_id": dept["id"], "contract_service": "S",
            "po_number": f"PO{uuid.uuid4().hex[:4]}", "notice_period": "SHOULD NOT STICK",
            "start_date": "2026-01-01", "end_date": "2026-12-31", "force": True}),
        "milestone": client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers,
                                 json={"title": "should not stick"}),
        "assignee": client.put(f"/api/contracts/{sr}/assignee", headers=admin_headers,
                               json={"assignee_id": None}),
        "tags": client.put(f"/api/contracts/{sr}/tags", headers=admin_headers, json={"tag_ids": []}),
        "note": client.post(f"/api/contracts/{sr}/notes", headers=admin_headers,
                            json={"body": "should not stick"}),
        "payment": client.post("/api/payments", headers=admin_headers,
                               json={"contract_id": sr, "amount": 1}),
    }
    for name, resp in blocked.items():
        assert resp.status_code == 423, f"{name} bypassed the legal hold ({resp.status_code})"

    detail = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
    assert detail["notice_period"] == "30 days", "the held record was modified"

    # Releasing the hold restores normal behaviour.
    client.delete(f"/api/contracts/{sr}/legal-hold", headers=admin_headers)
    assert client.post(f"/api/contracts/{sr}/milestones", headers=admin_headers,
                       json={"title": "now allowed"}).status_code == 200


def test_legal_hold_still_allows_reading_and_release(client, admin_headers):
    """The hold must not lock people out of the record it is preserving."""
    sr = _seed()
    client.post(f"/api/contracts/{sr}/legal-hold", headers=admin_headers, json={"reason": "audit"})
    assert client.get(f"/api/contracts/{sr}", headers=admin_headers).status_code == 200
    assert client.get(f"/api/contracts/{sr}/milestones", headers=admin_headers).status_code == 200
    assert client.delete(f"/api/contracts/{sr}/legal-hold", headers=admin_headers).status_code == 200


def test_legal_hold_requires_privilege(client, validator_headers):
    sr = _seed()
    assert client.post(f"/api/contracts/{sr}/legal-hold", headers=validator_headers,
                       json={"reason": "nope"}).status_code == 403


def test_legal_hold_blocks_purge(client, admin_headers, super_admin_headers):
    sr = _seed()
    client.post(f"/api/contracts/{sr}/legal-hold", headers=admin_headers, json={"reason": "hold"})
    # soft-delete is blocked while held, so release, delete, re-hold via DB to test purge guard
    from app.database import SessionLocal
    from app.models import Contract
    from datetime import datetime, timezone
    db = SessionLocal()
    c = db.get(Contract, sr)
    c.deleted_at = datetime.now(timezone.utc)  # simulate a prior soft-delete
    db.commit(); db.close()
    r = client.post("/api/retention/purge", headers=super_admin_headers,
                    json={"entity_type": "contract", "id": sr})
    assert r.status_code == 423


def test_restricted_field_edit_permission(client, admin_headers, validator_headers):
    sr = _seed()
    client.put("/api/settings", headers=admin_headers,
               json={"values": {"restricted_contract_fields": "contract_value,savings_amount"}})
    try:
        # validator cannot change a restricted field
        r = client.put(f"/api/contracts/{sr}", headers=validator_headers, json={"contract_value": 999})
        assert r.status_code == 403
        # ... but can edit a non-restricted field
        assert client.put(f"/api/contracts/{sr}", headers=validator_headers,
                          json={"notice_period": "30 days"}).status_code == 200
        # admin can edit the restricted field
        assert client.put(f"/api/contracts/{sr}", headers=admin_headers,
                          json={"contract_value": 999}).status_code == 200
    finally:
        client.put("/api/settings", headers=admin_headers, json={"values": {"restricted_contract_fields": ""}})
