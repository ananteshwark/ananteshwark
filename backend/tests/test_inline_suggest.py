"""R3 2.3: inline suggestion-mode redline (edited doc → tracked changes)."""
from app.services.collaboration import derive_inline_changes


def _doc(texts):
    return {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": t}]} for t in texts
    ]}


def test_derive_replace_insert_delete():
    original = _doc(["Alpha clause stays.", "Beta clause old wording.", "Gamma clause to remove."])
    edited = _doc(["Alpha clause stays.", "Beta clause NEW wording.", "Delta brand-new clause."])
    changes = derive_inline_changes(original, edited)
    kinds = [c["change_type"] for c in changes]
    assert "REPLACE" in kinds or ("DELETE" in kinds and "INSERT" in kinds)
    # the beta replacement is captured
    assert any(c.get("proposed_text", "").find("NEW wording") >= 0 for c in changes)


def test_no_change_yields_nothing():
    d = _doc(["Same.", "Unchanged."])
    assert derive_inline_changes(d, d) == []


def _share(client, admin_headers, access="SUGGEST"):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    client.post(f"/api/authoring/drafts/{d['id']}/insert-clause", headers=admin_headers,
                json={"clause_type": "Indemnity", "text": "The vendor shall indemnify the company fully."})
    link = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers,
                       json={"recipients": [{"email": "v@x.com"}], "access": access}).json()["links"][0]
    return d, link


def test_endpoint_creates_changes(client, admin_headers):
    d, link = _share(client, admin_headers)
    detail = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
    # edit the inserted clause text
    doc = detail["document"]
    for b in doc["content"]:
        for t in (b.get("content") or []):
            if t.get("type") == "text" and "indemnify" in t.get("text", ""):
                t["text"] = "The vendor shall indemnify the company only up to fees paid."
    r = client.post(f"/api/vendor/{link['token']}/suggest-inline", json={"document": doc})
    assert r.status_code == 200, r.text
    assert r.json()["created"] >= 1
    # the change appears in the vendor's change list
    rows = client.get(f"/api/vendor/{link['token']}/changes").json()
    assert any("up to fees paid" in (c.get("proposed_text") or "") for c in rows)


def test_endpoint_blocks_view_only(client, admin_headers):
    d, link = _share(client, admin_headers, access="VIEW")
    r = client.post(f"/api/vendor/{link['token']}/suggest-inline", json={"document": {"type": "doc", "content": []}})
    assert r.status_code == 403
