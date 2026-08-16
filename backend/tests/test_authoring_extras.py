"""Approval-request notifications, department default signers, DOCX/PDF export."""
import io
import uuid
import zipfile


def _draft(client, headers, ctype="MSA"):
    return client.post("/api/authoring/drafts", headers=headers,
                       json={"origin": "scratch", "contract_type": ctype}).json()


class TestApprovalNotifications:
    def test_request_notifies_approvers(self, client, admin_headers):
        # A dedicated Approver user who should be notified of a finance request.
        email = f"appr-{uuid.uuid4().hex[:6]}@example.com"
        uid = client.post("/api/auth/users", headers=admin_headers,
                          json={"email": email, "name": "Fin", "password": "password123",
                                "role": "APPROVER"}).json()["id"]
        tok = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()["token"]
        appr_h = {"Authorization": f"Bearer {tok}"}

        d = _draft(client, admin_headers)
        client.post(f"/api/esign/drafts/{d['id']}/request-approval?gate=finance", headers=admin_headers)

        notes = client.get("/api/notifications", headers=appr_h).json()
        assert any(n["type"] == "approval" and f"#{d['id']}" in n["message"] for n in notes)

    def test_legal_gate_notifies_legal_not_approver(self, client, admin_headers):
        legal_email = f"legal-{uuid.uuid4().hex[:6]}@example.com"
        client.post("/api/auth/users", headers=admin_headers,
                    json={"email": legal_email, "name": "Legal", "password": "password123", "role": "LEGAL"})
        legal_h = {"Authorization": f"Bearer {client.post('/api/auth/login', json={'email': legal_email, 'password': 'password123'}).json()['token']}"}
        d = _draft(client, admin_headers)
        client.post(f"/api/esign/drafts/{d['id']}/request-approval?gate=legal", headers=admin_headers)
        assert any(n["type"] == "approval" for n in client.get("/api/notifications", headers=legal_h).json())


class TestDepartmentDefaultSigners:
    def test_department_stores_and_returns_signers(self, client, admin_headers):
        name = f"SignDept-{uuid.uuid4().hex[:6]}"
        d = client.post("/api/departments", headers=admin_headers, json={
            "name": name,
            "default_signers": [
                {"name": "Company Rep", "email": "rep@iks.com", "role": "Signer", "order": 1},
                {"name": "Vendor Rep", "email": "rep@vendor.com", "role": "Signer", "order": 2},
            ],
        }).json()
        assert len(d["default_signers"]) == 2
        listed = client.get("/api/departments", headers=admin_headers).json()
        got = next(x for x in listed if x["id"] == d["id"])
        assert got["default_signers"][0]["email"] == "rep@iks.com"


class TestExports:
    def test_docx_export_is_valid_and_contains_values(self, client, admin_headers):
        d = _draft(client, admin_headers)
        client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers,
                   json={"fields": {"vendor": "Acme Ltd", "signing_entity": "TruBridge"}})
        r = client.get(f"/api/authoring/drafts/{d['id']}/export.docx", headers=admin_headers)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
        z = zipfile.ZipFile(io.BytesIO(r.content))
        assert "word/document.xml" in z.namelist()
        xml = z.read("word/document.xml").decode()
        assert "Acme Ltd" in xml and "TruBridge" in xml

    def test_pdf_export(self, client, admin_headers):
        d = _draft(client, admin_headers)
        r = client.get(f"/api/authoring/drafts/{d['id']}/export.pdf", headers=admin_headers)
        assert r.status_code == 200 and r.content[:8] == b"%PDF-1.4"

    def test_redline_docx_lists_changes(self, client, admin_headers):
        d = _draft(client, admin_headers)
        link = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers,
                           json={"recipients": [{"email": "v@x.com"}]}).json()["links"][0]
        client.post(f"/api/vendor/{link['token']}/changes", json={
            "change_type": "DELETE", "clause_type": "Indemnity",
            "original_text": "The Vendor shall indemnify the Company."})
        r = client.get(f"/api/authoring/drafts/{d['id']}/redline.docx", headers=admin_headers)
        assert r.status_code == 200
        xml = zipfile.ZipFile(io.BytesIO(r.content)).read("word/document.xml").decode()
        assert "REDLINE" in xml and "Indemnity" in xml
