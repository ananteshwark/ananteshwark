"""R5 3.7: promoting a draft to a template re-tokenizes concrete values."""
from app.services.authoring import retokenize_document


def _doc(text):
    return {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": text}]}]}


def test_retokenize_replaces_values_with_merge_chips():
    fields = {"vendor": "Acme Ltd", "po_number": "PO-9987", "signing_entity": "Inventurus"}
    doc = _doc("This agreement between Inventurus and Acme Ltd references PO-9987.")
    out = retokenize_document(doc, fields)
    inline = out["content"][0]["content"]
    merged_fields = [n["attrs"]["field"] for n in inline if n.get("type") == "mergeField"]
    assert "vendor" in merged_fields and "po_number" in merged_fields and "signing_entity" in merged_fields
    # the concrete values no longer appear as plain text
    text = "".join(n.get("text", "") for n in inline if n.get("type") == "text")
    assert "Acme Ltd" not in text and "PO-9987" not in text


def test_short_values_not_tokenized():
    fields = {"currency": "INR", "vendor": "X"}   # too short / excluded
    doc = _doc("Payment in INR by X.")
    out = retokenize_document(doc, fields)
    inline = out["content"][0]["content"]
    assert all(n.get("type") == "text" for n in inline)  # nothing tokenized


def test_endpoint_promotes_with_tokens(client, admin_headers):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers,
               json={"fields": {"vendor": "Globex Corporation"}})
    # type the vendor value as free text into the document
    client.post(f"/api/authoring/drafts/{d['id']}/insert-clause", headers=admin_headers,
                json={"clause_type": "Parties", "text": "This is made with Globex Corporation as vendor."})
    tpl = client.post(f"/api/authoring/drafts/{d['id']}/promote-template", headers=admin_headers,
                      json={"name": "Reusable MSA"}).json()
    # fetch the template body and confirm a vendor merge chip exists
    full = client.get(f"/api/authoring/templates/{tpl['id']}", headers=admin_headers).json()
    blocks = full["body"]["content"]
    has_vendor_chip = any(
        n.get("type") == "mergeField" and n["attrs"]["field"] == "vendor"
        for b in blocks for n in (b.get("content") or [])
    )
    assert has_vendor_chip
