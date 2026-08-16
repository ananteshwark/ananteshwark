"""R3 2.11: rich-formatting (marks + lists) and watermark in exports."""
import io
import zipfile

from app.services.authoring import render_text
from app.services.docx import document_to_docx
from app.services.pdf import text_to_pdf


def _doc():
    return {"type": "doc", "content": [
        {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "1 Scope"}]},
        {"type": "paragraph", "content": [
            {"type": "text", "text": "This is "},
            {"type": "text", "text": "bold", "marks": [{"type": "bold"}]},
            {"type": "text", "text": " and "},
            {"type": "text", "text": "italic", "marks": [{"type": "italic"}]},
            {"type": "text", "text": " text."},
        ]},
        {"type": "bulletList", "content": [
            {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "first point"}]}]},
            {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "second point"}]}]},
        ]},
        {"type": "orderedList", "content": [
            {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "step one"}]}]},
            {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "step two"}]}]},
        ]},
    ]}


def test_render_text_flattens_lists():
    out = render_text(_doc(), {})
    assert "• first point" in out and "• second point" in out
    assert "1. step one" in out and "2. step two" in out


def test_docx_has_marks_and_list_markers():
    data = document_to_docx("Contract", _doc(), {})
    xml = zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml").decode()
    assert "<w:b/>" in xml       # bold run
    assert "<w:i/>" in xml       # italic run
    assert "step two" in xml and "2. " in xml  # ordered list marker text


def test_pdf_watermark_present():
    plain = text_to_pdf("T", "body")
    marked = text_to_pdf("T", "body", watermark="DRAFT")
    assert marked[:8] == b"%PDF-1.4"
    assert b"(DRAFT) Tj" in marked and b"(DRAFT) Tj" not in plain
