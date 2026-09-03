"""R4 3.4: end-to-end workflow test across the whole authoring lifecycle.

Drives the critical path through the real API — author → clause → share → vendor
inline suggestion → internal disposition → send for signature → webhook completion
→ executed contract in the register — so a regression anywhere along it is caught.
This is the dependency-free E2E that runs in CI; a browser-driven Playwright
scaffold (dev-only, needs a live stack) lives under frontend/e2e.
"""


def test_full_authoring_lifecycle(client, admin_headers):
    h = admin_headers

    # 1. Author a draft from scratch with the mandatory register fields.
    dept = client.post("/api/departments", headers=h, json={"name": "E2EDept"}).json()
    d = client.post("/api/authoring/drafts", headers=h,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    client.put(f"/api/authoring/drafts/{d['id']}", headers=h, json={
        "department_id": dept["id"],
        "fields": {"signing_entity": "Inventurus", "vendor": "E2E Vendor",
                   "start_date": "2026-01-01", "end_date": "2026-12-31",
                   "contract_service": "Managed services", "po_number": "PO-E2E-1",
                   "contract_value": 2500000, "currency": "INR"},
    })

    # 2. Insert a clause from raw text.
    client.post(f"/api/authoring/drafts/{d['id']}/insert-clause", headers=h,
                json={"clause_type": "Indemnity", "text": "The vendor shall indemnify the company fully."})

    # 3. Async gap review completes.
    client.post(f"/api/authoring/drafts/{d['id']}/review-async", headers=h)

    # 4. Share with a vendor; vendor submits an inline suggestion.
    link = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=h,
                       json={"recipients": [{"email": "rep@e2e-vendor.com"}], "access": "SUGGEST"}).json()["links"][0]
    detail = client.get(f"/api/authoring/drafts/{d['id']}", headers=h).json()
    doc = detail["document"]
    for b in doc["content"]:
        for t in (b.get("content") or []):
            if t.get("type") == "text" and "indemnify" in t.get("text", ""):
                t["text"] = "The vendor shall indemnify the company up to fees paid."
    sug = client.post(f"/api/vendor/{link['token']}/suggest-inline", json={"document": doc})
    assert sug.status_code == 200 and sug.json()["created"] >= 1

    # 5. Internal side sees the change and dispositions it (history recorded).
    changes = client.get(f"/api/authoring/drafts/{d['id']}/changes", headers=h).json()
    cid = changes[0]["id"]
    client.post(f"/api/authoring/changes/{cid}/decide", headers=h,
                json={"decision": "ACCEPTED", "reason": "reasonable cap"})
    hist = client.get(f"/api/authoring/drafts/{d['id']}/disposition-history", headers=h).json()
    assert any(e["disposition"] == "ACCEPTED" for e in hist)

    # 5b. The vendor accepts the current version — required before it can be sent.
    assert client.post(f"/api/vendor/{link['token']}/accept").status_code == 200

    # 6. Send for signature (mock provider) and complete via webhook.
    env = client.post(f"/api/esign/drafts/{d['id']}/send", headers=h, json={
        "signers": [{"name": "Co Rep", "email": "co@x.com", "role": "Signer", "order": 1},
                    {"name": "Vend Rep", "email": "rep@e2e-vendor.com", "role": "Signer", "order": 2}],
        "expire_days": 20,
    }).json()
    assert env["status"] == "SENT"
    done = client.post("/api/esign/webhook", json={"envelope_id": env["external_id"], "status": "completed"})
    assert done.status_code == 200 and done.json()["status"] == "COMPLETED"

    # 7. An executed contract now exists in the register with the signed doc + cert.
    draft = client.get(f"/api/authoring/drafts/{d['id']}", headers=h).json()
    assert draft["status"] == "EXECUTED" and draft["contract_id"]
    contract = client.get(f"/api/contracts/{draft['contract_id']}", headers=h).json()
    assert contract["status"] == "VALIDATED"
    assert contract["contract_value"] == 2500000
    envs = client.get("/api/esign/envelopes", headers=h).json()
    row = next(e for e in envs if e["external_id"] == env["external_id"])
    assert row["signed_pdf"] and row["certificate"]
