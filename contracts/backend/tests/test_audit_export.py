"""Test CSV export of the organization-wide audit log."""
import csv
import io


class TestAuditExport:
    def test_export_csv_shape_and_filters(self, client, admin_headers):
        # generate an auditable action: create then reject a contract
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="AuditVendor", contract_service="svc",
                     status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        client.post(f"/api/contracts/{sr}/reject", headers=admin_headers, json={"reason": "x"})

        r = client.get("/api/audit/export?entity_type=contract", headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("text/csv")
        assert "audit_log.csv" in r.headers["content-disposition"]

        reader = list(csv.DictReader(io.StringIO(r.text)))
        assert reader, "expected at least one audit row"
        assert set(reader[0].keys()) >= {
            "id", "created_at", "entity_type", "entity_id", "action", "field",
            "old_value", "new_value", "user", "user_id",
        }
        assert all(row["entity_type"] == "contract" for row in reader)
        assert any(row["entity_id"] == str(sr) for row in reader)

    def test_export_requires_admin(self, client, admin_headers):
        email = "viewer_audit@example.com"
        client.post("/api/auth/users", headers=admin_headers,
                    json={"email": email, "name": "V", "password": "viewer12345", "role": "VIEWER"})
        token = client.post("/api/auth/login",
                            json={"email": email, "password": "viewer12345"}).json()["token"]
        r = client.get("/api/audit/export", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403
