"""Contract request intake: submit, triage, convert to a draft."""


def _viewer(client, admin_headers):
    """Create a plain viewer + return their auth header."""
    client.post("/api/auth/users", headers=admin_headers, json={
        "email": "requester@example.com", "name": "Reqr", "password": "password123",
        "roles": ["VIEWER"],
    })
    tok = client.post("/api/auth/login", json={"email": "requester@example.com",
                                               "password": "password123"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def test_submit_and_triage_and_convert(client, admin_headers):
    h = _viewer(client, admin_headers)
    # A plain viewer can submit a request.
    r = client.post("/api/requests", headers=h, json={
        "title": "NDA with Globex", "counterparty_name": "Globex",
        "contract_type": "NDA", "estimated_value": 0, "priority": "high",
        "description": "Standard mutual NDA",
    })
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    assert r.json()["status"] == "SUBMITTED"

    # The requester sees only their own.
    mine = client.get("/api/requests", headers=h).json()
    assert [x["id"] for x in mine["requests"]] == [rid]
    assert mine["can_triage"] is False

    # Admin (triager) sees it and can convert it into a draft.
    allr = client.get("/api/requests", headers=admin_headers).json()
    assert any(x["id"] == rid for x in allr["requests"]) and allr["can_triage"] is True

    conv = client.post(f"/api/requests/{rid}/convert", headers=admin_headers)
    assert conv.status_code == 200, conv.text
    draft_id = conv.json()["draft_id"]
    assert conv.json()["request"]["status"] == "CONVERTED"

    # The draft exists and is pre-filled from the request.
    d = client.get(f"/api/authoring/drafts/{draft_id}", headers=admin_headers).json()
    assert d["contract_type"] == "NDA"
    assert d["fields"].get("vendor") == "Globex"
    assert d["origin"] == "request"

    # Re-converting is blocked.
    assert client.post(f"/api/requests/{rid}/convert", headers=admin_headers).status_code == 409


def test_requester_cannot_triage(client, admin_headers):
    h = _viewer(client, admin_headers)
    r = client.post("/api/requests", headers=h, json={"title": "Some request"}).json()
    # A viewer cannot convert or patch.
    assert client.post(f"/api/requests/{r['id']}/convert", headers=h).status_code == 403
    assert client.patch(f"/api/requests/{r['id']}", headers=h, json={"status": "REJECTED"}).status_code == 403


def test_reject_request(client, admin_headers):
    h = _viewer(client, admin_headers)
    r = client.post("/api/requests", headers=h, json={"title": "To reject"}).json()
    dec = client.patch(f"/api/requests/{r['id']}", headers=admin_headers,
                       json={"status": "REJECTED", "decision_reason": "duplicate of existing MSA"})
    assert dec.status_code == 200 and dec.json()["status"] == "REJECTED"
    assert dec.json()["decision_reason"] == "duplicate of existing MSA"
