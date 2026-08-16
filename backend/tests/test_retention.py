"""Tests for the data-retention (soft-delete listing / restore / purge) API."""
from app.models import utcnow


class TestRetention:
    def _deleted_vendor(self, client, admin_headers, name="PurgeVendor"):
        v = client.post("/api/vendors", headers=admin_headers, json={"name": name}).json()
        from app.database import SessionLocal
        from app.models import Vendor
        db = SessionLocal()
        db.get(Vendor, v["id"]).deleted_at = utcnow()
        db.commit(); db.close()
        return v["id"]

    def test_summary_and_listing(self, client, admin_headers):
        vid = self._deleted_vendor(client, admin_headers, "ListedVendor")
        summary = client.get("/api/retention/summary", headers=admin_headers).json()
        assert summary["vendor"] >= 1

        listed = client.get("/api/retention/deleted?entity_type=vendor", headers=admin_headers).json()
        assert any(it["id"] == vid for it in listed["items"])

    def test_restore_vendor(self, client, admin_headers):
        vid = self._deleted_vendor(client, admin_headers, "RestoreVendor")
        r = client.post("/api/retention/restore", headers=admin_headers,
                        json={"entity_type": "vendor", "id": vid})
        assert r.status_code == 200
        # now it no longer shows as deleted
        listed = client.get("/api/retention/deleted?entity_type=vendor", headers=admin_headers).json()
        assert all(it["id"] != vid for it in listed["items"])

    def test_purge_vendor_removes_it(self, client, admin_headers, super_admin_headers):
        vid = self._deleted_vendor(client, admin_headers, "GonePurgeVendor")
        r = client.post("/api/retention/purge", headers=super_admin_headers,
                        json={"entity_type": "vendor", "id": vid})
        assert r.status_code == 200
        from app.database import SessionLocal
        from app.models import Vendor
        db = SessionLocal()
        assert db.get(Vendor, vid) is None
        db.close()

    def test_purge_blocked_when_referenced_by_live_contract(self, client, admin_headers, super_admin_headers):
        vid = self._deleted_vendor(client, admin_headers, "BusyVendor")
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_id=vid, vendor_name_raw="x", contract_service="svc",
                     status=ContractStatus.VALIDATED, raw_extracted={}, confidence={})
        db.add(c); db.commit(); db.close()
        r = client.post("/api/retention/purge", headers=super_admin_headers,
                        json={"entity_type": "vendor", "id": vid})
        assert r.status_code == 409

    def test_purge_contract_cascades_children(self, client, admin_headers, super_admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractNote, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="PurgeMe", contract_service="svc",
                     status=ContractStatus.REJECTED, raw_extracted={}, confidence={},
                     deleted_at=utcnow())
        db.add(c); db.commit(); sr = c.sr_no
        db.add(ContractNote(contract_id=sr, body="note")); db.commit(); db.close()

        r = client.post("/api/retention/purge", headers=super_admin_headers,
                        json={"entity_type": "contract", "id": sr})
        assert r.status_code == 200
        db = SessionLocal()
        assert db.get(Contract, sr) is None
        assert db.query(ContractNote).filter(ContractNote.contract_id == sr).count() == 0
        db.close()

    def test_restore_missing_404_and_requires_admin(self, client, admin_headers):
        assert client.post("/api/retention/restore", headers=admin_headers,
                           json={"entity_type": "vendor", "id": 999999}).status_code == 404
        # viewer is forbidden
        email = "ret_viewer@example.com"
        client.post("/api/auth/users", headers=admin_headers,
                    json={"email": email, "name": "V", "password": "viewer12345", "role": "VIEWER"})
        token = client.post("/api/auth/login", json={"email": email, "password": "viewer12345"}).json()["token"]
        r = client.get("/api/retention/summary", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403
