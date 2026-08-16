"""R3 2.15: clause insertion at a chosen block index (drag-and-drop drop target)."""


def _draft(client, h):
    return client.post("/api/authoring/drafts", headers=h, json={"origin": "scratch", "contract_type": "MSA"}).json()


def _blocks(client, h, did):
    d = client.get(f"/api/authoring/drafts/{did}", headers=h).json()
    return d["document"]["content"]


def test_insert_at_index_places_block_there(client, admin_headers):
    d = _draft(client, admin_headers)
    # append first clause
    client.post(f"/api/authoring/drafts/{d['id']}/insert-clause", headers=admin_headers,
                json={"clause_type": "Indemnity", "text": "Indemnity wording alpha."})
    before = _blocks(client, admin_headers, d["id"])
    n = len(before)
    # drop a second clause at the very top (index 0)
    r = client.post(f"/api/authoring/drafts/{d['id']}/insert-clause", headers=admin_headers,
                    json={"clause_type": "Confidentiality", "text": "Confidentiality wording beta.", "index": 0})
    assert r.status_code == 200, r.text
    after = _blocks(client, admin_headers, d["id"])
    assert len(after) == n + 2  # heading + paragraph

    def text_of(b):
        return "".join(t.get("text", "") for t in (b.get("content") or []) if t.get("type") == "text")
    # the beta clause paragraph now appears before the alpha clause paragraph
    beta = next(i for i, b in enumerate(after) if "beta" in text_of(b))
    alpha = next(i for i, b in enumerate(after) if "alpha" in text_of(b))
    assert beta < alpha
