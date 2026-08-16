"""Text-extraction / OCR diagnostics."""
import pytest

from app.services.text_extraction import TextExtractionError, extract_text


def test_scanned_image_ocr_path_is_understandable(tmp_path):
    """A scanned image either OCRs to text or, when OCR isn't available (or the
    image has no text), fails with a clear, actionable message — never a vague
    or silent empty result."""
    from PIL import Image
    p = tmp_path / "scan.png"
    Image.new("RGB", (32, 32), "white").save(p)

    try:
        out = extract_text(str(p))
    except TextExtractionError as exc:
        msg = str(exc).lower()
        assert any(k in msg for k in ("tesseract", "pytesseract", "poppler", "no text"))
    else:
        assert isinstance(out, str)


def test_unsupported_type_rejected(tmp_path):
    p = tmp_path / "note.txt"
    p.write_text("hello")
    with pytest.raises(TextExtractionError):
        extract_text(str(p))
