"""Stored uploads must never be served as executable content."""
import pytest

from app.services.file_serving import DEFAULT_MEDIA_TYPE, media_type_for, safe_file_response


@pytest.mark.parametrize("name", ["evil.html", "evil.htm", "evil.svg", "x.xhtml", "s.js", "no-extension"])
def test_script_bearing_and_unknown_types_are_not_rendered(name):
    # octet-stream makes the browser download rather than render it, so it
    # cannot execute in the app origin via the same-origin preview iframe.
    assert media_type_for(name) == DEFAULT_MEDIA_TYPE


@pytest.mark.parametrize(
    "name,expected",
    [
        ("doc.pdf", "application/pdf"),
        ("DOC.PDF", "application/pdf"),      # case-insensitive
        ("scan.png", "image/png"),
        ("scan.JPG", "image/jpeg"),
        ("note.txt", "text/plain"),
    ],
)
def test_known_safe_types_keep_their_media_type(name, expected):
    assert media_type_for(name) == expected


def test_response_sets_nosniff(tmp_path):
    f = tmp_path / "doc.pdf"
    f.write_bytes(b"%PDF-1.4\n")
    resp = safe_file_response(f)
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.media_type == "application/pdf"


def test_html_upload_is_neutralized_end_to_end(tmp_path):
    f = tmp_path / "payload.html"
    f.write_bytes(b"<script>fetch('//evil')</script>")
    resp = safe_file_response(f, "payload.html")
    assert resp.media_type == DEFAULT_MEDIA_TYPE
    assert resp.headers["x-content-type-options"] == "nosniff"
