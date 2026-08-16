"""R4 3.13: normalized, append-only disposition history."""


def _draft_with_change(client, h):
    d = client.post("/api/authoring/drafts", headers=h,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    link = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=h,
                       json={"recipients": [{"email": "v@x.com"}]}).json()["links"][0]
    ch = client.post(f"/api/vendor/{link['token']}/changes", json={
        "change_type": "REPLACE", "original_text": "a", "proposed_text": "b"}).json()
    return d, ch


def test_each_decision_is_recorded(client, admin_headers):
    d, ch = _draft_with_change(client, admin_headers)
    cid = ch["id"]
    client.post(f"/api/authoring/changes/{cid}/decide", headers=admin_headers,
                json={"decision": "REJECTED", "reason": "too broad"})
    client.post(f"/api/authoring/changes/{cid}/decide", headers=admin_headers,
                json={"decision": "COUNTERED", "reason": "meet halfway", "countered_text": "b-lite"})

    hist = client.get(f"/api/authoring/drafts/{d['id']}/disposition-history", headers=admin_headers).json()
    assert len(hist) == 2
    assert hist[0]["disposition"] == "REJECTED" and hist[0]["reason"] == "too broad"
    assert hist[1]["disposition"] == "COUNTERED" and hist[1]["countered_text"] == "b-lite"
    assert all(e["change_id"] == cid for e in hist)


def test_empty_history(client, admin_headers):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "NDA"}).json()
    assert client.get(f"/api/authoring/drafts/{d['id']}/disposition-history", headers=admin_headers).json() == []
