"""E-signature (Module E) + approval gates (Module F)."""


def _draft(client, headers, ctype="MSA", value=None):
    d = client.post("/api/authoring/drafts", headers=headers,
                    json={"origin": "scratch", "contract_type": ctype}).json()
    fields = {"vendor": "Acme Ltd", "signing_entity": "TruBridge",
              "start_date": "2026-01-01", "contract_tenure": "12 Months",
              "contract_service": "Managed services"}
    if value is not None:
        fields["contract_value"] = value
    client.put(f"/api/authoring/drafts/{d['id']}", headers=headers, json={"fields": fields})
    return d


def _signers():
    return {"signers": [
        {"name": "Company Rep", "email": "rep@ikshealth.com", "role": "Signer", "order": 1},
        {"name": "Vendor Rep", "email": "rep@vendor.com", "role": "Signer", "order": 2},
    ]}


class TestPdf:
    def test_generates_valid_pdf(self):
        from app.services.pdf import text_to_pdf
        pdf = text_to_pdf("TITLE", "Body line one.\n\nSecond paragraph. " + "word " * 300)
        assert pdf[:8] == b"%PDF-1.4" and pdf.rstrip().endswith(b"%%EOF")


class TestEnvelopeLifecycle:
    def test_send_status_and_webhook_completion_publishes_contract(self, client, admin_headers):
        d = _draft(client, admin_headers)
        r = client.post(f"/api/esign/drafts/{d['id']}/send", headers=admin_headers, json=_signers())
        assert r.status_code == 200, r.text
        env = r.json()
        assert env["status"] == "SENT" and env["external_id"].startswith("mock-")

        # draft is frozen for signature
        assert client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers,
                          json={"title": "x"}).status_code == 409

        # webhook: viewed -> then completed
        client.post("/api/esign/webhook", json={"envelope_id": env["external_id"], "status": "viewed",
                                                 "recipients": [{"email": "rep@vendor.com", "status": "viewed"}]})
        done = client.post("/api/esign/webhook", json={"envelope_id": env["external_id"], "status": "completed"})
        assert done.status_code == 200 and done.json()["status"] == "COMPLETED"

        # An EXECUTED (validated) contract now exists, linked to the draft
        detail = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
        assert detail["status"] == "EXECUTED" and detail["contract_id"]
        contract = client.get(f"/api/contracts/{detail['contract_id']}", headers=admin_headers).json()
        assert contract["status"] == "VALIDATED"
        assert contract["contract_type"] == "MSA"
        assert contract["end_date"] == "2026-12-31"

        # 2.5: the Certificate of Completion was retrieved and is downloadable.
        envs = client.get("/api/esign/envelopes", headers=admin_headers).json()
        row = next(e for e in envs if e["external_id"] == env["external_id"])
        assert row["certificate"] is True and row["signed_pdf"] is True
        cert = client.get(f"/api/esign/envelopes/{row['id']}/certificate.pdf", headers=admin_headers)
        assert cert.status_code == 200 and cert.content[:8] == b"%PDF-1.4"
        signed = client.get(f"/api/esign/envelopes/{row['id']}/signed.pdf", headers=admin_headers)
        assert signed.status_code == 200 and signed.content[:8] == b"%PDF-1.4"

    def test_void_reopens_editing(self, client, admin_headers):
        d = _draft(client, admin_headers)
        env = client.post(f"/api/esign/drafts/{d['id']}/send", headers=admin_headers, json=_signers()).json()
        v = client.post(f"/api/esign/envelopes/{env['id']}/void?reason=Superseded", headers=admin_headers)
        assert v.status_code == 200 and v.json()["status"] == "VOIDED"
        # editable again
        assert client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers,
                          json={"title": "edited"}).status_code == 200


class TestApprovalGates:
    def test_value_threshold_blocks_send_until_finance_approves(self, client, admin_headers):
        # Require finance approval above a 100000 threshold
        client.put("/api/settings", headers=admin_headers, json={"values": {"approval_value_threshold": "100000"}})
        d = _draft(client, admin_headers, value=500000)

        gates = client.get(f"/api/esign/drafts/{d['id']}/approvals", headers=admin_headers).json()
        assert gates["satisfied"] is False
        assert any(g["gate"] == "finance" for g in gates["required"])

        # send is blocked
        blocked = client.post(f"/api/esign/drafts/{d['id']}/send", headers=admin_headers, json=_signers())
        assert blocked.status_code == 403

        # request + approve finance, then send succeeds
        appr = client.post(f"/api/esign/drafts/{d['id']}/request-approval?gate=finance", headers=admin_headers).json()
        client.post(f"/api/esign/approvals/{appr['approval_id']}/decide", headers=admin_headers,
                    json={"status": "APPROVED"})
        ok = client.post(f"/api/esign/drafts/{d['id']}/send", headers=admin_headers, json=_signers())
        assert ok.status_code == 200, ok.text

        # reset threshold so other tests are unaffected
        client.put("/api/settings", headers=admin_headers, json={"values": {"approval_value_threshold": "0"}})
