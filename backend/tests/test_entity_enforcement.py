"""Predefined-entity enforcement at validation + internal-entity merge."""
from datetime import date

from app.database import SessionLocal
from app.models import Contract, ContractStatus, Department, InternalEntity


def _pending(signing_entity):
    db = SessionLocal()
    dept = db.query(Department).filter_by(name="EntDept").first() or Department(name="EntDept")
    db.add(dept); db.flush()
    c = Contract(vendor_name_raw="EntV", signing_entity=signing_entity, contract_service="svc",
                 po_number="PO1", department_id=dept.id, start_date=date(2025, 1, 1),
                 end_date=date(2025, 12, 31), contract_value=10,
                 status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


def _entity(name, aliases=None):
    db = SessionLocal()
    if not db.query(InternalEntity).filter(InternalEntity.name == name).first():
        db.add(InternalEntity(name=name, aliases=aliases or []))
        db.commit()
    db.close()


def test_validate_blocks_unknown_entity(client, admin_headers):
    sr = _pending("Definitely Not A Real Entity Inc")
    r = client.post(f"/api/contracts/{sr}/validate", headers=admin_headers, json={"force": True})
    assert r.status_code == 422
    assert "not a recognized internal entity" in r.json()["detail"]


def test_validate_snaps_alias_to_canonical(client, admin_headers):
    _entity("Globex Corporation", aliases=["Globex", "GBX"])
    sr = _pending("GBX")  # an alias
    r = client.post(f"/api/contracts/{sr}/validate", headers=admin_headers, json={"force": True})
    assert r.status_code == 200, r.text
    assert r.json()["contract"]["signing_entity"] == "Globex Corporation"  # snapped


def test_bulk_validate_skips_unknown_entity(client, admin_headers):
    sr = _pending("Unknown Bulk Entity XYZ")
    r = client.post("/api/contracts/bulk", headers=admin_headers,
                    json={"sr_nos": [sr], "action": "validate"})
    assert r.status_code == 200
    body = r.json()
    assert body["updated_count"] == 0
    assert "predefined internal entity" in body["skipped"][0]["reason"]


def test_merge_entities_repoints_and_absorbs(client, admin_headers):
    _entity("Acme Global", aliases=[])
    _entity("Acme Regional", aliases=["ACR"])
    db = SessionLocal()
    tgt = db.query(InternalEntity).filter_by(name="Acme Global").first().id
    src = db.query(InternalEntity).filter_by(name="Acme Regional").first().id
    # A validated contract signed under the source entity.
    c = Contract(vendor_name_raw="MV", signing_entity="Acme Regional", contract_service="svc",
                 status=ContractStatus.VALIDATED, raw_extracted={}, confidence={})
    db.add(c); db.commit(); csr = c.sr_no; db.close()

    r = client.post(f"/api/internal-entities/{tgt}/merge", headers=admin_headers,
                    json={"source_ids": [src]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["contracts_moved"] == 1
    assert "Acme Regional" in body["absorbed"]

    db = SessionLocal()
    assert db.get(Contract, csr).signing_entity == "Acme Global"   # re-pointed
    assert db.get(InternalEntity, src).deleted_at is not None       # source archived
    assert "Acme Regional" in (db.get(InternalEntity, tgt).aliases or [])  # absorbed as alias
    db.close()


def test_captured_values_and_repoint(client, admin_headers):
    _entity("Inventurus Knowledge Solutions", aliases=[])
    db = SessionLocal()
    # Same entity captured three ways (trailing space, punctuation, case).
    for name in ("Inventurus Knowledge Solutions", "Inventurus Knowledge Solutions ",
                 "inventurus knowledge solutions."):
        db.add(Contract(vendor_name_raw="RV", signing_entity=name, contract_service="svc",
                        status=ContractStatus.VALIDATED, raw_extracted={}, confidence={}))
    db.commit(); db.close()

    listing = client.get("/api/internal-entities/captured-values", headers=admin_headers).json()["values"]
    variants = [v["value"] for v in listing if "inventurus" in v["value"].lower()]
    assert len(variants) >= 3  # the three spellings each show as their own captured value

    r = client.post("/api/internal-entities/repoint", headers=admin_headers, json={
        "from_values": variants, "to_name": "Inventurus Knowledge Solutions", "add_as_aliases": True,
    })
    assert r.status_code == 200, r.text
    assert r.json()["contracts_moved"] >= 2  # the non-canonical spellings are re-pointed

    after = client.get("/api/internal-entities/captured-values", headers=admin_headers).json()["values"]
    inv = [v["value"] for v in after if "inventurus" in v["value"].lower()]
    assert inv == ["Inventurus Knowledge Solutions"]  # collapsed to a single dashboard value


def test_rename_entity_repoints_contracts(client, admin_headers):
    _entity("Rename Solutions Inc", aliases=[])
    db = SessionLocal()
    eid = db.query(InternalEntity).filter_by(name="Rename Solutions Inc").first().id
    c = Contract(vendor_name_raw="RN", signing_entity="Rename Solutions Inc", contract_service="svc",
                 status=ContractStatus.VALIDATED, raw_extracted={}, confidence={})
    db.add(c); db.commit(); csr = c.sr_no; db.close()

    r = client.put(f"/api/internal-entities/{eid}", headers=admin_headers,
                   json={"name": "Rename Solutions Limited", "aliases": []})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Rename Solutions Limited"
    assert r.json()["contracts_repointed"] == 1
    assert "Rename Solutions Inc" in r.json()["aliases"]  # old name kept as alias

    db = SessionLocal()
    assert db.get(Contract, csr).signing_entity == "Rename Solutions Limited"  # carried with the rename
    db.close()


def test_save_snaps_abbreviation_variant_to_canonical(client, admin_headers):
    """Save (PUT) snaps an abbreviation variant of the SAME entity to the master's
    canonical spelling (Pvt Ltd -> Private Limited), same as Validate."""
    _entity("Zephyr Private Limited", aliases=[])
    sr = _pending("Zephyr Private Limited")
    r = client.put(f"/api/contracts/{sr}", headers=admin_headers, json={"signing_entity": "Zephyr Pvt Ltd"})
    assert r.status_code == 200
    assert r.json()["signing_entity"] == "Zephyr Private Limited"  # abbreviation resolved


def test_distinct_suffixes_are_separate_entities(client, admin_headers):
    """'X Inc' and 'X Limited' are now DIFFERENT entities: creating both is allowed
    and a contract under one does not resolve to the other."""
    _entity("Meridian Inc", aliases=[])
    _entity("Meridian Limited", aliases=[])
    sr = _pending("Meridian Limited")
    r = client.post(f"/api/contracts/{sr}/validate", headers=admin_headers, json={"force": True})
    assert r.status_code == 200, r.text
    assert r.json()["contract"]["signing_entity"] == "Meridian Limited"  # not snapped to 'Inc'


def test_ind_expands_to_india(client, admin_headers):
    _entity("Nimbus India", aliases=[])
    sr = _pending("Nimbus Ind")
    r = client.post(f"/api/contracts/{sr}/validate", headers=admin_headers, json={"force": True})
    assert r.status_code == 200, r.text
    assert r.json()["contract"]["signing_entity"] == "Nimbus India"  # Ind -> India
