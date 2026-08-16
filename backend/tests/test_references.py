"""R3 2.4: cross-references and defined terms detection."""
from app.services import references


def _doc(headings_and_paras):
    content = []
    for kind, txt in headings_and_paras:
        content.append({"type": kind, "content": [{"type": "text", "text": txt}]})
    return {"type": "doc", "content": content}


def test_defined_terms_and_unused_flag():
    text = ('The parties agree that "Confidential Information" means any non-public data. '
            'Confidential Information shall be protected. '
            'This "Agreement" is binding.')
    r = references.analyze(None, text)
    terms = {t["term"]: t for t in r["defined_terms"]}
    assert "Confidential Information" in terms
    assert terms["Confidential Information"]["unused"] is False   # used again
    assert "Agreement" in terms
    assert terms["Agreement"]["unused"] is True                   # only appears once


def test_dangling_cross_reference_flagged():
    doc = _doc([("heading", "1 Term"), ("paragraph", "See Section 1 and Section 9 for details."),
                ("heading", "2 Services"), ("paragraph", "As described in Section 2.")])
    text = "Term\n\nSee Section 1 and Section 9 for details.\n\nServices\n\nAs described in Section 2."
    r = references.analyze(doc, text)
    refs = {f"{c['kind']} {c['number']}": c for c in r["cross_refs"]}
    assert refs["Section 1"]["dangling"] is False
    assert refs["Section 2"]["dangling"] is False
    assert refs["Section 9"]["dangling"] is True
    assert any("Section 9" in i for i in r["issues"])


def test_endpoint(client, admin_headers):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    r = client.get(f"/api/authoring/drafts/{d['id']}/references", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert "defined_terms" in body and "cross_refs" in body and "issues" in body
