"""P1.2 — accepting an edit keeps merge-field bindings when the value survives."""
from app.models import ChangeType, ContractDraft, Disposition, TrackedChange
from app.services.collaboration import apply_change_to_document


def _field_doc():
    return {"type": "doc", "content": [{"type": "paragraph", "content": [
        {"type": "text", "text": "This agreement starts on "},
        {"type": "mergeField", "attrs": {"field": "start_date", "value": "2026-01-01"}},
        {"type": "text", "text": " and is binding."}]}]}


def test_binding_preserved_when_value_kept():
    d = ContractDraft(document=_field_doc(), fields={})
    ch = TrackedChange(change_type=ChangeType.REPLACE,
                       original_text="This agreement starts on 2026-01-01 and is binding.",
                       proposed_text="This contract commences on 2026-01-01 and remains binding.",
                       disposition=Disposition.ACCEPTED)
    assert apply_change_to_document(d, ch) is True
    nodes = d.document["content"][0]["content"]
    assert any(n["type"] == "mergeField" for n in nodes)   # chip preserved
    assert any("commences" in n.get("text", "") for n in nodes)  # reworded text applied


def test_flattens_when_value_removed():
    doc = {"type": "doc", "content": [{"type": "paragraph", "content": [
        {"type": "text", "text": "Starts on "},
        {"type": "mergeField", "attrs": {"field": "start_date", "value": "2026-01-01"}}]}]}
    d = ContractDraft(document=doc, fields={})
    ch = TrackedChange(change_type=ChangeType.REPLACE, original_text="Starts on 2026-01-01",
                       proposed_text="Starts on the effective date", disposition=Disposition.ACCEPTED)
    assert apply_change_to_document(d, ch) is True
    nodes = d.document["content"][0]["content"]
    assert all(n["type"] != "mergeField" for n in nodes)   # binding intentionally dropped
