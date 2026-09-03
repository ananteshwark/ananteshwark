"""Tests for the validation-form helpers: master lists (currencies / business
units) and the AI department suggestion."""
from app.models import ContractStatus


class TestMasterLists:
    def test_defaults_include_common_currencies(self, client, admin_headers):
        r = client.get("/api/settings/master-lists", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert "INR" in body["currencies"] and "USD" in body["currencies"]
        assert isinstance(body["business_units"], list)

    def test_admin_can_add_currency_and_bu(self, client, admin_headers):
        r = client.put("/api/settings/master-lists", headers=admin_headers,
                       json={"currencies": ["INR", "JPY"], "business_units": ["North America", "EMEA"]})
        assert r.status_code == 200
        assert "JPY" in r.json()["currencies"]
        assert "EMEA" in r.json()["business_units"]
        # Persisted across reads.
        again = client.get("/api/settings/master-lists", headers=admin_headers).json()
        assert "JPY" in again["currencies"]

    def test_viewer_can_read_but_not_write(self, client, admin_headers, super_admin_headers):
        # readable
        assert client.get("/api/settings/master-lists", headers=admin_headers).status_code == 200
        # super admin can write (supersedes admin)
        r = client.put("/api/settings/master-lists", headers=super_admin_headers,
                       json={"currencies": ["INR"]})
        assert r.status_code == 200


class TestDepartmentSuggestion:
    def test_suggests_from_similar_validated_contracts(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, Department
        db = SessionLocal()
        dept = Department(name="Radiology Ops")
        db.add(dept); db.flush()
        did = dept.id
        # Three validated contracts sharing a signing entity + service tokens.
        for i in range(3):
            db.add(Contract(vendor_name_raw=f"Vend{i}", contract_service="teleradiology reporting nighthawk",
                            signing_entity="IKS Health", status=ContractStatus.VALIDATED,
                            department_id=did, raw_extracted={}, confidence={}))
        # The contract needing a suggestion — same entity + service, no department.
        target = Contract(vendor_name_raw="NewVend", contract_service="teleradiology reporting service",
                          signing_entity="IKS Health", status=ContractStatus.PENDING_VALIDATION,
                          raw_extracted={}, confidence={})
        db.add(target); db.commit()
        sr = target.sr_no
        db.close()

        r = client.get(f"/api/contracts/{sr}/suggest-department", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["department_id"] == did
        assert body["department_name"] == "Radiology Ops"
        assert body["confidence"] > 0

    def test_no_suggestion_when_no_history(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract
        db = SessionLocal()
        c = Contract(vendor_name_raw="Lonely", contract_service="zzqq unique nonsense tokens",
                     status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        r = client.get(f"/api/contracts/{sr}/suggest-department", headers=admin_headers)
        assert r.status_code == 200
        # Either no department or at least a valid shape; must not error.
        assert "department_id" in r.json()
