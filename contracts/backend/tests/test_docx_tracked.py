"""G5: native Word tracked-changes .docx export + re-import round-trip."""
import io
import zipfile

from app.services.docx import (
    document_to_docx_tracked,
    parse_tracked_changes,
    tracked_changes_to_records,
)


def _doc():
    return {"type": "doc", "content": [
        {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "1 Liability"}]},
        {"type": "paragraph", "content": [{"type": "text",
         "text": "The liability of each party shall not exceed the fees paid in the last twelve months."}]},
    ]}


def _xml(data):
    return zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml").decode()


def test_tracked_export_has_native_revisions():
    changes = [
        {"change_type": "REPLACE", "original_text": "twelve months",
         "proposed_text": "six months", "author_email": "vendor@acme.test"},
        {"change_type": "INSERT", "proposed_text": "This clause survives termination.",
         "author_email": "vendor@acme.test"},
    ]
    data = document_to_docx_tracked("Contract", _doc(), {}, changes)
    xml = _xml(data)
    assert "<w:del " in xml and "<w:delText" in xml       # real deletion
    assert "<w:ins " in xml                                # real insertion
    assert "twelve months" in xml and "six months" in xml
    assert 'w:author="vendor@acme.test"' in xml
    assert "This clause survives termination." in xml


def test_roundtrip_parse_recovers_changes():
    changes = [
        {"change_type": "REPLACE", "original_text": "twelve months",
         "proposed_text": "six months", "author_email": "vendor@acme.test"},
        {"change_type": "INSERT", "proposed_text": "This clause survives termination.",
         "author_email": "vendor@acme.test"},
    ]
    data = document_to_docx_tracked("Contract", _doc(), {}, changes)
    revs = parse_tracked_changes(data)
    kinds = [r["type"] for r in revs]
    assert "delete" in kinds and "insert" in kinds
    recs = tracked_changes_to_records(revs)
    # the delete+insert of the same author folds back into one REPLACE
    replace = next(r for r in recs if r["change_type"] == "REPLACE")
    assert replace["original_text"] == "twelve months" and replace["proposed_text"] == "six months"
    assert any(r["change_type"] == "INSERT" and "survives termination" in (r["proposed_text"] or "") for r in recs)


def test_parse_rejects_non_docx():
    import pytest
    with pytest.raises(ValueError):
        parse_tracked_changes(b"not a zip file")


class TestTrackedApi:
    def test_export_and_import_endpoints(self, client, admin_headers):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers, json={"document": _doc()})

        # A pending tracked change to export as a native revision.
        from app.database import SessionLocal
        from app.models import ChangeType, Disposition, TrackedChange
        db = SessionLocal()
        db.add(TrackedChange(draft_id=d["id"], change_type=ChangeType.REPLACE,
                             original_text="twelve months", proposed_text="six months",
                             author_email="vendor@acme.test", disposition=Disposition.PENDING))
        db.commit(); db.close()

        r = client.get(f"/api/authoring/drafts/{d['id']}/export-tracked.docx", headers=admin_headers)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
        xml = _xml(r.content)
        assert "<w:del " in xml and "<w:ins " in xml

        # Re-import that same file: its revisions come back as pending changes.
        files = {"file": ("redline.docx", r.content,
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        imp = client.post(f"/api/authoring/drafts/{d['id']}/import-tracked?apply=true",
                          headers=admin_headers, files=files).json()
        assert imp["imported"] >= 1 and imp["applied"] >= 1
        # applied replacement is reflected in the document text
        doc = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
        import json as _json
        assert "six months" in _json.dumps(doc["document"])
