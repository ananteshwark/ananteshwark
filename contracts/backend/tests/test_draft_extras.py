"""R5 3.15: tags and attachments while drafting, flowing to the finalized contract."""
import io


def _draft(client, h):
    return client.post("/api/authoring/drafts", headers=h,
                       json={"origin": "scratch", "contract_type": "MSA"}).json()


def _finalizable_fields(client, admin_headers, extra=None):
    dept = client.post("/api/departments", headers=admin_headers, json={"name": f"D{io.BytesIO().__hash__() & 0xffff}"}).json()
    f = {"signing_entity": "Inventurus", "vendor": "DXVendor",
         "start_date": "2026-01-01", "end_date": "2026-12-31",
         "contract_service": "svc", "po_number": "PO-DX-1"}
    if extra:
        f.update(extra)
    return dept["id"], f


def test_draft_attachment_upload_list_download_delete(client, admin_headers):
    d = _draft(client, admin_headers)
    files = {"file": ("annex.txt", b"annexure body", "text/plain")}
    up = client.post(f"/api/authoring/drafts/{d['id']}/attachments?kind=annexure",
                     headers=admin_headers, files=files)
    assert up.status_code == 200
    aid = up.json()["id"]
    rows = client.get(f"/api/authoring/drafts/{d['id']}/attachments", headers=admin_headers).json()
    assert any(a["id"] == aid and a["kind"] == "annexure" for a in rows)
    dl = client.get(f"/api/authoring/drafts/{d['id']}/attachments/{aid}/file", headers=admin_headers)
    assert dl.status_code == 200 and dl.content == b"annexure body"
    assert client.delete(f"/api/authoring/drafts/{d['id']}/attachments/{aid}", headers=admin_headers).status_code == 200
    rows2 = client.get(f"/api/authoring/drafts/{d['id']}/attachments", headers=admin_headers).json()
    assert all(a["id"] != aid for a in rows2)


def test_tags_and_attachments_flow_to_contract(client, admin_headers):
    tag = client.post("/api/tags", headers=admin_headers, json={"name": "priority-x", "color": "#f00"}).json()
    d = _draft(client, admin_headers)
    dept_id, fields = _finalizable_fields(client, admin_headers, extra={"tag_ids": [tag["id"]]})
    client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers,
               json={"department_id": dept_id, "fields": fields})
    client.post(f"/api/authoring/drafts/{d['id']}/attachments",
                headers=admin_headers, files={"file": ("a.txt", b"x", "text/plain")})
    sr = client.post(f"/api/authoring/drafts/{d['id']}/finalize", headers=admin_headers).json()["contract_id"]

    detail = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
    assert any(t["name"] == "priority-x" for t in detail.get("tags", []))
    atts = client.get(f"/api/contracts/{sr}/attachments", headers=admin_headers).json()
    assert len(atts) >= 1
