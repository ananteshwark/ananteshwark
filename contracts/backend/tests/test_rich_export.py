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


def _formatted_doc():
    """Everything the editor's toolbar can now apply."""
    return {"type": "doc", "content": [
        {"type": "heading", "attrs": {"level": 1, "textAlign": "center"},
         "content": [{"type": "text", "text": "SCHEDULE A"}]},
        {"type": "paragraph", "attrs": {"textAlign": "right"}, "content": [
            {"type": "text", "text": "coloured",
             "marks": [{"type": "textStyle", "attrs": {"color": "#B3261E"}}]},
            {"type": "text", "text": "sized",
             "marks": [{"type": "textStyle", "attrs": {"fontSize": "14pt"}}]},
            {"type": "text", "text": "serif",
             "marks": [{"type": "textStyle", "attrs": {"fontFamily": '"Times New Roman", Times, serif'}}]},
            {"type": "text", "text": "marked",
             "marks": [{"type": "highlight", "attrs": {"color": "#fff2a8"}}]},
            {"type": "text", "text": "2", "marks": [{"type": "superscript"}]},
            {"type": "text", "text": "n", "marks": [{"type": "subscript"}]},
            {"type": "text", "text": "struck", "marks": [{"type": "strike"}]},
            {"type": "text", "text": "under", "marks": [{"type": "underline"}]},
        ]},
        {"type": "blockquote", "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "quoted term"}]},
        ]},
        {"type": "horizontalRule"},
    ]}


class TestToolbarFormattingSurvivesExport:
    """The editor gained colour, font, size, highlight, alignment and
    sub/superscript. The exporter honoured only bold/italic/underline/strike, so
    formatting an export was quietly discarded on the way to Word."""

    def _xml(self):
        data = document_to_docx("Contract", _formatted_doc(), {})
        return zipfile.ZipFile(io.BytesIO(data)).read("word/document.xml").decode()

    def test_colour_font_and_size(self):
        xml = self._xml()
        assert '<w:color w:val="B3261E"/>' in xml
        assert '<w:sz w:val="28"/>' in xml               # 14pt -> 28 half-points
        assert 'w:ascii="Times New Roman"' in xml        # first family only, unquoted

    def test_highlight_and_vertical_alignment(self):
        xml = self._xml()
        assert 'w:fill="FFF2A8"' in xml
        assert '<w:vertAlign w:val="superscript"/>' in xml
        assert '<w:vertAlign w:val="subscript"/>' in xml

    def test_paragraph_alignment_and_blocks(self):
        xml = self._xml()
        assert '<w:jc w:val="center"/>' in xml           # centred heading
        assert '<w:jc w:val="right"/>' in xml            # right-aligned paragraph
        assert "quoted term" in xml and '<w:ind w:left="720"/>' in xml
        assert "<w:pBdr>" in xml                         # horizontal rule

    def test_unparseable_colour_is_dropped_not_written_black(self):
        doc = {"type": "doc", "content": [{"type": "paragraph", "content": [
            {"type": "text", "text": "x",
             "marks": [{"type": "textStyle", "attrs": {"color": "rgb(1,2,3)"}}]}]}]}
        xml = zipfile.ZipFile(io.BytesIO(document_to_docx("C", doc, {}))).read("word/document.xml").decode()
        assert "<w:color" not in xml
