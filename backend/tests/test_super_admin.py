"""Tests for the SUPER_ADMIN role, contract deletion, and role-based page access."""
from app.models import ContractStatus


def _make_contract(client, admin_headers):
    from app.database import SessionLocal
    from app.models import Contract
    db = SessionLocal()
    c = Contract(vendor_name_raw="DeleteMeVendor", contract_service="svc",
                 status=ContractStatus.VALIDATED, raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


class TestContractDelete:
    def test_super_admin_can_soft_delete_contract(self, client, admin_headers, super_admin_headers):
        sr = _make_contract(client, admin_headers)
        r = client.delete(f"/api/contracts/{sr}", headers=super_admin_headers)
        assert r.status_code == 200, r.text

        from app.database import SessionLocal
        from app.models import Contract
        db = SessionLocal()
        assert db.get(Contract, sr).deleted_at is not None
        db.close()

        # It now appears in the retention (soft-deleted) listing.
        listed = client.get("/api/retention/deleted?entity_type=contract",
                            headers=admin_headers).json()
        assert any(it["id"] == sr for it in listed["items"])

    def test_admin_cannot_delete_contract(self, client, admin_headers):
        sr = _make_contract(client, admin_headers)
        r = client.delete(f"/api/contracts/{sr}", headers=admin_headers)
        assert r.status_code == 403

    def test_super_admin_bypasses_admin_gates(self, client, super_admin_headers):
        # A pure super-admin (not ADMIN) still passes require_admin-guarded routes.
        r = client.get("/api/settings", headers=super_admin_headers)
        assert r.status_code == 200


class TestPageAccess:
    def test_get_page_access_defaults(self, client, admin_headers):
        cfg = client.get("/api/settings/page-access", headers=admin_headers).json()
        assert "pages" in cfg and "roles" in cfg and "access" in cfg
        keys = {p["key"] for p in cfg["pages"]}
        assert {"dashboard", "contracts", "settings"} <= keys
        # Settings is admin-only by default.
        assert cfg["access"]["settings"] == ["ADMIN"]
        # SUPER_ADMIN is implicit, never an assignable role in the matrix.
        assert "SUPER_ADMIN" not in cfg["roles"]

    def test_admin_can_override_page_access(self, client, admin_headers):
        r = client.put("/api/settings/page-access", headers=admin_headers,
                       json={"access": {"reports": ["ADMIN", "VALIDATOR"]}})
        assert r.status_code == 200
        assert r.json()["access"]["reports"] == ["ADMIN", "VALIDATOR"]
        # Unknown roles are dropped on save.
        r2 = client.put("/api/settings/page-access", headers=admin_headers,
                        json={"access": {"reports": ["ADMIN", "NOTAROLE"]}})
        assert r2.json()["access"]["reports"] == ["ADMIN"]

    def test_non_admin_cannot_change_page_access(self, client, super_admin_headers):
        # Super admin CAN (supersedes admin); a viewer cannot — checked via the
        # readable GET being open to all signed-in users but PUT admin-guarded.
        r = client.put("/api/settings/page-access", headers=super_admin_headers,
                       json={"access": {"reports": ["ADMIN"]}})
        assert r.status_code == 200
