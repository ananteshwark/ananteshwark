"""R2: clause comments, clause swap, ledger export, vendor watermark download."""
import io
import zipfile


def _draft(client, h, ctype="MSA"):
    return client.post("/api/authoring/drafts", headers=h, json={"origin": "scratch", "contract_type": ctype}).json()


class TestComments:
    def test_add_list_delete(self, client, admin_headers):
        d = _draft(client, admin_headers)
        cid = client.post(f"/api/authoring/drafts/{d['id']}/comments", headers=admin_headers,
                          json={"body": "Check the liability cap."}).json()["id"]
        rows = client.get(f"/api/authoring/drafts/{d['id']}/comments", headers=admin_headers).json()
        assert any(c["id"] == cid and "liability" in c["body"] for c in rows)
        assert client.delete(f"/api/authoring/comments/{cid}", headers=admin_headers).status_code == 200
        assert client.get(f"/api/authoring/drafts/{d['id']}/comments", headers=admin_headers).json() == []


class TestClauseSwap:
    def test_swap_replaces_block_and_returns_redline(self, client, admin_headers):
        d = _draft(client, admin_headers)
        # insert a clause, then a second version to swap to
        client.post(f"/api/authoring/drafts/{d['id']}/insert-clause", headers=admin_headers,
                    json={"clause_type": "Indemnity", "text": "Original indemnity wording."})
        v2 = client.post("/api/clauses/versions", headers=admin_headers,
                         json={"clause_type": "Indemnity", "text": "Stronger indemnity wording, company favourable."}).json()
        detail = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
        # locate the inserted clause paragraph by its text
        def block_text(b):
            return "".join(t.get("text", "") for t in (b.get("content") or []) if t.get("type") == "text")
        idx = next(i for i, b in enumerate(detail["document"]["content"])
                   if b.get("type") == "paragraph" and "Original indemnity" in block_text(b))
        r = client.post(f"/api/authoring/drafts/{d['id']}/swap-clause", headers=admin_headers,
                        json={"block_index": idx, "version_id": v2["id"]})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "Original indemnity" in body["old_text"]
        assert "Stronger indemnity" in body["new_text"]


class TestLedgerExport:
    def test_xlsx_and_pdf(self, client, admin_headers):
        d = _draft(client, admin_headers)
        link = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers,
                           json={"recipients": [{"email": "v@x.com"}]}).json()["links"][0]
        client.post(f"/api/vendor/{link['token']}/changes", json={
            "change_type": "REPLACE", "original_text": "a", "proposed_text": "b"})
        xlsx = client.get(f"/api/authoring/drafts/{d['id']}/ledger.xlsx", headers=admin_headers)
        assert xlsx.status_code == 200
        assert "word/document.xml" not in zipfile.ZipFile(io.BytesIO(xlsx.content)).namelist()  # it's a workbook
        assert "xl/workbook.xml" in zipfile.ZipFile(io.BytesIO(xlsx.content)).namelist()
        pdf = client.get(f"/api/authoring/drafts/{d['id']}/ledger.pdf", headers=admin_headers)
        assert pdf.status_code == 200 and pdf.content[:8] == b"%PDF-1.4"


class TestVendorDownload:
    def test_download_gated_by_allow_download(self, client, admin_headers):
        d = _draft(client, admin_headers)
        # default: download not allowed -> 403
        link = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers,
                           json={"recipients": [{"email": "v@x.com"}], "allow_download": False}).json()["links"][0]
        assert client.get(f"/api/vendor/{link['token']}/document.pdf").status_code == 403
        # allowed -> watermarked PDF
        link2 = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers,
                            json={"recipients": [{"email": "v@x.com"}], "allow_download": True, "watermark": True}).json()["links"][0]
        r = client.get(f"/api/vendor/{link2['token']}/document.pdf")
        assert r.status_code == 200 and r.content[:8] == b"%PDF-1.4"
        assert b"CONFIDENTIAL DRAFT" in r.content
