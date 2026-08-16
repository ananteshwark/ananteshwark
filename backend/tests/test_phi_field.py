"""PHI-shared as a first-class contract field: persist, filter, finalize mapping."""
from app.models import ContractStatus


def _mk(client, admin_headers, phi):
    from app.database import SessionLocal
    from app.models import Contract
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"PHIvend-{phi}", contract_service="svc",
                 status=ContractStatus.VALIDATED, phi_shared=phi, raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


class TestPhiField:
    def test_serializer_and_filter(self, client, admin_headers):
        yes = _mk(client, admin_headers, True)
        no = _mk(client, admin_headers, False)

        detail = client.get(f"/api/contracts/{yes}", headers=admin_headers).json()
        assert detail["phi_shared"] is True

        only_yes = client.get("/api/contracts?phi_shared=true&limit=500", headers=admin_headers).json()
        ids = [i["sr_no"] for i in only_yes["items"]]
        assert yes in ids and no not in ids

        only_no = client.get("/api/contracts?phi_shared=false&limit=500", headers=admin_headers).json()
        ids = [i["sr_no"] for i in only_no["items"]]
        assert no in ids and yes not in ids

    def test_editable_on_update(self, client, admin_headers):
        sr = _mk(client, admin_headers, None)
        r = client.put(f"/api/contracts/{sr}", headers=admin_headers, json={"phi_shared": True})
        assert r.status_code == 200
        assert client.get(f"/api/contracts/{sr}", headers=admin_headers).json()["phi_shared"] is True

    def test_finalize_carries_phi_from_draft(self, client, admin_headers):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers, json={
            "fields": {"vendor": "Acme", "signing_entity": "IKS", "start_date": "2026-01-01",
                       "end_date": "2026-12-31", "contract_service": "svc", "po_number": "PO1",
                       "phi_shared": True}})
        res = client.post(f"/api/authoring/drafts/{d['id']}/finalize", headers=admin_headers)
        assert res.status_code == 200, res.text
        cid = res.json()["contract_id"]
        assert client.get(f"/api/contracts/{cid}", headers=admin_headers).json()["phi_shared"] is True
