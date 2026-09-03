"""OCR word-coordinate capture.

Risk shading used to work only on PDFs that carry a text layer. A scanned
contract renders perfectly and shades nothing — the case where the document is
purely an image and the reader most needs the flags drawn for them. Capturing
where each word sat at OCR time gives the viewer coordinates to draw against.

The text and the boxes come from one image_to_data call precisely so they
cannot disagree; a word present in the stored text but missing from the stored
boxes is a flag that silently fails to place. These tests hold that invariant.

Tesseract's binary is not installed in CI, so image_to_data is driven with
recorded output of the shape it really returns: a row per layout element, not
per word, with empty text and conf -1 on the non-word rows.
"""
import sys
import types

import pytest

from app.services import text_extraction as tx


def _fake_tesseract(rows):
    """A stand-in pytesseract whose image_to_data returns `rows`."""
    mod = types.ModuleType("pytesseract")
    mod.Output = types.SimpleNamespace(DICT="dict")

    class TesseractNotFoundError(Exception):
        pass

    mod.TesseractNotFoundError = TesseractNotFoundError
    mod.image_to_data = lambda image, output_type=None: rows
    return mod


class _Img:
    size = (2550, 3300)

    def convert(self, _mode):
        return self


# Two lines in one paragraph, then a second line group — the shape Tesseract
# returns for a heading followed by a sentence.
ROWS = {
    "level":     [1, 2, 3, 4, 5, 5, 4, 5, 5, 5],
    "block_num": [0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    "par_num":   [0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
    "line_num":  [0, 0, 0, 1, 1, 1, 2, 2, 2, 2],
    "text":      ["", "", "", "", "The", "Vendor", "", "shall", "indemnify", "~"],
    "conf":      ["-1", "-1", "-1", "-1", "96", "95", "-1", "92", "88", "4"],
    "left":      [0, 0, 0, 0, 100, 220, 0, 100, 210, 900],
    "top":       [0, 0, 0, 0, 200, 200, 0, 260, 260, 262],
    "width":     [0, 0, 0, 0, 100, 150, 0, 90, 210, 8],
    "height":    [0, 0, 0, 0, 30, 30, 0, 28, 28, 6],
}


@pytest.fixture
def fake_ocr(monkeypatch):
    monkeypatch.setitem(sys.modules, "pytesseract", _fake_tesseract(ROWS))
    yield


class TestPageReconstruction:
    def test_text_is_grouped_into_lines(self, fake_ocr):
        text, _layout = tx._ocr_page(_Img())
        assert text == "The Vendor\nshall indemnify"

    def test_boxes_carry_pixel_coordinates(self, fake_ocr):
        _text, layout = tx._ocr_page(_Img())
        assert layout["w"] == 2550 and layout["h"] == 3300
        assert layout["words"][0] == {"t": "The", "x": 100, "y": 200, "w": 100, "h": 30}

    def test_low_confidence_noise_is_dropped_from_both(self, fake_ocr):
        """The "~" at conf 4 is a scan speck. It must not appear as a word box
        (a stray highlight on the page) nor in the text (an unmatchable token in
        the middle of a clause)."""
        text, layout = tx._ocr_page(_Img())
        assert "~" not in text
        assert all(w["t"] != "~" for w in layout["words"])

    def test_every_stored_word_appears_in_the_stored_text(self, fake_ocr):
        """The invariant the single-pass design exists to guarantee. If these
        ever diverge, quotes found in extracted_text cannot be placed against
        the boxes and shading silently degrades."""
        text, layout = tx._ocr_page(_Img())
        tokens = text.split()
        assert [w["t"] for w in layout["words"]] == tokens


class TestImageDocuments:
    def test_layout_is_returned_for_a_scanned_image(self, fake_ocr, tmp_path, monkeypatch):
        from PIL import Image
        p = tmp_path / "scan.png"
        Image.new("RGB", (2550, 3300), "white").save(p)

        text, layout = tx.extract_text_with_layout(str(p))
        assert text.startswith("The Vendor")
        assert layout["dpi"] == tx.OCR_DPI
        assert len(layout["pages"]) == 1
        assert layout["pages"][0]["words"]

    def test_no_layout_when_ocr_found_no_words(self, tmp_path, monkeypatch):
        empty = dict(ROWS, text=["", "", ""], conf=["-1", "-1", "-1"],
                     level=[1, 2, 3], block_num=[0, 1, 1], par_num=[0, 0, 1],
                     line_num=[0, 0, 0], left=[0, 0, 0], top=[0, 0, 0],
                     width=[0, 0, 0], height=[0, 0, 0])
        monkeypatch.setitem(sys.modules, "pytesseract", _fake_tesseract(empty))
        from PIL import Image
        p = tmp_path / "blank.png"
        Image.new("RGB", (100, 100), "white").save(p)
        with pytest.raises(tx.TextExtractionError):
            tx.extract_text_with_layout(str(p))


class TestDigitalDocumentsCarryNoLayout:
    def test_docx_has_no_layout(self, tmp_path):
        import docx
        p = tmp_path / "d.docx"
        d = docx.Document()
        d.add_paragraph("The Vendor shall indemnify the Company without limit.")
        d.save(p)

        text, layout = tx.extract_text_with_layout(str(p))
        assert "indemnify" in text
        # A digital document's coordinates are read off the page by the viewer.
        # A second set from OCR would only be a chance to disagree with it.
        assert layout is None


class TestCompatibility:
    def test_extract_text_still_returns_a_plain_string(self, fake_ocr, tmp_path):
        """Callers that have no use for coordinates keep the old signature."""
        from PIL import Image
        p = tmp_path / "scan.png"
        Image.new("RGB", (200, 200), "white").save(p)
        assert isinstance(tx.extract_text(str(p)), str)
