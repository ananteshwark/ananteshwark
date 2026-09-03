"""Per-business-unit letterheads: resolution, page geometry, and the outputs.

Three things have to hold, and they are not the same thing:

  * the right BU's paper is chosen for a draft;
  * the artwork actually reaches the PDF, the DOCX and the signature copy —
    asserted against the *embedded image*, not against a flag on a dict, because
    "the code took the letterhead branch" and "the contract came out on
    letterhead" have been different answers before;
  * body text still fits on the page underneath it.
"""
import io
import zipfile

import pytest
from PIL import Image

from app.services import letterhead as LH

EMAIL, PASSWORD = "admin@example.com", "adminpass123"


def _png(width=1600, height=300, color=(10, 60, 120)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def _upload(client, headers, bu, kind="header", data=None, name="lh.png"):
    return client.post(f"/api/settings/letterhead?bu={bu}&kind={kind}",
                       headers=headers, files={"file": (name, data or _png(), "image/png")})


@pytest.fixture
def bu_letterheads(client, admin_headers):
    """Two business units on different paper, plus a default."""
    _upload(client, admin_headers, "", data=_png(color=(30, 30, 30)))
    _upload(client, admin_headers, "Arai", data=_png(color=(10, 60, 120)))
    _upload(client, admin_headers, "WWMG", data=_png(color=(120, 20, 20)))
    yield
    for bu in ("", "Arai", "WWMG"):
        client.delete(f"/api/settings/letterhead?bu={bu}&kind=all", headers=admin_headers)


# ---------------------------------------------------------------------------
# Storage and normalisation
# ---------------------------------------------------------------------------

class TestUpload:
    def test_a_png_is_stored_as_jpeg(self, client, admin_headers):
        """One stored format keeps both writers simple: a PDF carries JPEG bytes
        verbatim, and Word embeds the same file."""
        r = _upload(client, admin_headers, "Normalise")
        assert r.status_code == 200, r.text
        img = client.get("/api/settings/letterhead/image?bu=Normalise", headers=admin_headers)
        assert img.headers["content-type"] == "image/jpeg"
        with Image.open(io.BytesIO(img.content)) as im:
            assert im.format == "JPEG" and im.mode == "RGB"
        client.delete("/api/settings/letterhead?bu=Normalise&kind=all", headers=admin_headers)

    def test_transparency_is_flattened_onto_white(self, client, admin_headers):
        """A logo on a transparent background must not come out on a black one —
        JPEG has no alpha, so the flattening has to be deliberate."""
        buf = io.BytesIO()
        Image.new("RGBA", (1600, 300), (255, 0, 0, 0)).save(buf, format="PNG")
        assert _upload(client, admin_headers, "Alpha", data=buf.getvalue()).status_code == 200
        img = client.get("/api/settings/letterhead/image?bu=Alpha", headers=admin_headers)
        with Image.open(io.BytesIO(img.content)) as im:
            r, g, b = im.convert("RGB").getpixel((800, 150))
        assert (r, g, b) > (240, 240, 240), f"transparent pixel became {(r, g, b)}"
        client.delete("/api/settings/letterhead?bu=Alpha&kind=all", headers=admin_headers)

    def test_an_over_tall_banner_is_refused(self, client, admin_headers):
        """A full-page image would leave a document with no room for the
        contract. Rejecting it at upload beats discovering it at export."""
        r = _upload(client, admin_headers, "TooTall", data=_png(800, 1400))
        assert r.status_code == 400
        assert "too tall" in r.json()["detail"].lower()

    def test_a_non_image_is_refused(self, client, admin_headers):
        r = _upload(client, admin_headers, "NotAnImage",
                    data=b"%PDF-1.4 not an image", name="lh.pdf")
        assert r.status_code == 415, r.text

    def test_a_footer_needs_a_header_first(self, client, admin_headers):
        r = _upload(client, admin_headers, "FooterOnly", kind="footer", data=_png(1600, 120))
        assert r.status_code == 400
        assert "header" in r.json()["detail"].lower()

    def test_replacing_the_header_removes_the_old_file(self, client, admin_headers):
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            _upload(client, admin_headers, "Replace")
            first = LH.for_business_unit(db, "Replace").header_file
            _upload(client, admin_headers, "Replace", data=_png(color=(1, 2, 3)))
            db.expire_all()
            second = LH.for_business_unit(db, "Replace").header_file
            assert first != second
            assert not (LH._dir() / first).exists(), "the replaced artwork was left on disk"
        finally:
            db.close()
        client.delete("/api/settings/letterhead?bu=Replace&kind=all", headers=admin_headers)

    def test_only_an_admin_may_upload(self, client, admin_headers):
        from app.auth import hash_password
        from app.database import SessionLocal
        from app.models import User, UserRole
        db = SessionLocal()
        if not db.query(User).filter(User.email == "lh-viewer@example.com").first():
            db.add(User(email="lh-viewer@example.com", name="LH Viewer", role=UserRole.VIEWER,
                        hashed_password=hash_password("viewerpass123")))
            db.commit()
        db.close()
        from tests.conftest import _token
        headers = {"Authorization": f"Bearer {_token(client, 'lh-viewer@example.com', 'viewerpass123')}"}
        assert _upload(client, headers, "Sneaky").status_code == 403
        # ...but they may read one, or the editor could not show it to them.
        assert client.get("/api/settings/letterhead", headers=headers).status_code == 200


# ---------------------------------------------------------------------------
# Which BU's paper
# ---------------------------------------------------------------------------

class TestResolution:
    def test_each_bu_gets_its_own(self, client, admin_headers, bu_letterheads):
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            arai = LH.for_business_unit(db, "Arai")
            wwmg = LH.for_business_unit(db, "WWMG")
            assert arai.business_unit == "Arai"
            assert wwmg.business_unit == "WWMG"
            assert arai.header_file != wwmg.header_file
        finally:
            db.close()

    def test_matching_ignores_case_and_padding(self, client, admin_headers, bu_letterheads):
        """The BU on a draft is free text copied out of a picker."""
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            for spelling in ("arai", "  ARAI  ", "Arai"):
                assert LH.for_business_unit(db, spelling).business_unit == "Arai", spelling
        finally:
            db.close()

    def test_an_unknown_bu_falls_back_to_the_default(self, client, admin_headers, bu_letterheads):
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            assert LH.for_business_unit(db, "Nowhere").business_unit == ""
            assert LH.for_business_unit(db, None).business_unit == ""
        finally:
            db.close()

    def test_no_letterheads_at_all_means_plain_paper(self, client, admin_headers):
        """Not an error: a system with no letterheads configured keeps working
        exactly as it did before this feature existed."""
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            assert LH.render_spec(db, "Arai") is None
        finally:
            db.close()

    def test_missing_artwork_degrades_instead_of_failing(self, client, admin_headers):
        """Losing the file must cost the letterhead, never the download."""
        from app.database import SessionLocal
        _upload(client, admin_headers, "Vanish")
        db = SessionLocal()
        try:
            row = LH.for_business_unit(db, "Vanish")
            (LH._dir() / row.header_file).unlink()
            assert LH.render_spec(db, "Vanish") is None
        finally:
            db.close()
            client.delete("/api/settings/letterhead?bu=Vanish&kind=all", headers=admin_headers)


# ---------------------------------------------------------------------------
# Page geometry
# ---------------------------------------------------------------------------

class TestGeometry:
    def test_a_band_is_scaled_to_the_page_width(self):
        # 1600x300 art on a 612pt page: 612 * 300/1600 = 114.75pt.
        assert LH.band_height(1600, 300) == pytest.approx(114.75)

    def test_the_text_area_shrinks_by_the_bands(self):
        geo = LH.geometry_of((1600, 300), (1600, 120))
        assert geo["text_top_pt"] == pytest.approx(792 - 114.75 - LH.GAP_PT)
        assert geo["text_bottom_pt"] == pytest.approx(45.9 + LH.GAP_PT)
        assert LH.text_height_pt(geo) < 792

    def test_no_letterhead_reserves_nothing(self):
        geo = LH.geometry_of(None, None)
        assert geo["header_pt"] == 0 and geo["footer_pt"] == 0
        assert LH.text_height_pt(geo) == 792


# ---------------------------------------------------------------------------
# The generated documents
# ---------------------------------------------------------------------------

def _draft(client, headers, bu):
    r = client.post("/api/authoring/drafts", headers=headers,
                    json={"origin": "scratch", "contract_type": "MSA"})
    assert r.status_code == 200, r.text
    draft_id = r.json()["id"]
    # Long enough to run past one page, so "on every page" can be asserted.
    body = {"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": "Clause one. " * 800}]}]}
    r = client.put(f"/api/authoring/drafts/{draft_id}", headers=headers,
                   json={"document": body, "fields": {"location": bu}})
    assert r.status_code == 200, r.text
    return draft_id


def _pdf_images(data: bytes):
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(data))
    return [[im.image.size for im in page.images] for page in reader.pages]


class TestPdfOutput:
    def test_the_artwork_is_embedded_on_every_page(self, client, admin_headers, bu_letterheads):
        """A contract's second page going out on blank paper is the failure this
        feature exists to prevent, so the assertion is per page."""
        draft_id = _draft(client, admin_headers, "Arai")
        r = client.get(f"/api/authoring/drafts/{draft_id}/export.pdf", headers=admin_headers)
        assert r.status_code == 200
        per_page = _pdf_images(r.content)
        assert len(per_page) > 1, "the fixture text should run past one page"
        assert all(pages == [(1600, 300)] for pages in per_page), per_page

    def test_the_bu_decides_which_artwork(self, client, admin_headers, bu_letterheads):
        """Two BUs, two different images in the two PDFs — the property that
        makes this per-BU rather than a single global letterhead."""
        def header_bytes(bu):
            from pypdf import PdfReader
            draft_id = _draft(client, admin_headers, bu)
            r = client.get(f"/api/authoring/drafts/{draft_id}/export.pdf", headers=admin_headers)
            page = PdfReader(io.BytesIO(r.content)).pages[0]
            return list(page.images)[0].image.getpixel((800, 150))

        assert header_bytes("Arai") != header_bytes("WWMG")

    def test_body_text_clears_the_banner(self, client, admin_headers, bu_letterheads):
        """The text must start below the art, not on top of it."""
        from pypdf import PdfReader
        draft_id = _draft(client, admin_headers, "Arai")
        r = client.get(f"/api/authoring/drafts/{draft_id}/export.pdf", headers=admin_headers)
        stream = PdfReader(io.BytesIO(r.content)).pages[0].get_contents().get_data().decode("latin-1")
        origin = [ln for ln in stream.splitlines() if ln.endswith(" Tm")][0]
        baseline = float(origin.split()[-2])
        assert baseline <= 792 - 114.75 - LH.GAP_PT + 0.01, origin

    def test_plain_paper_when_no_letterhead_is_configured(self, client, admin_headers):
        draft_id = _draft(client, admin_headers, "Arai")
        r = client.get(f"/api/authoring/drafts/{draft_id}/export.pdf", headers=admin_headers)
        assert r.status_code == 200
        assert b"/XObject" not in r.content
        assert _pdf_images(r.content)[0] == []


class TestDocxOutput:
    def _parts(self, data: bytes):
        return set(zipfile.ZipFile(io.BytesIO(data)).namelist())

    def test_the_header_part_and_media_are_present(self, client, admin_headers, bu_letterheads):
        draft_id = _draft(client, admin_headers, "Arai")
        r = client.get(f"/api/authoring/drafts/{draft_id}/export.docx", headers=admin_headers)
        assert r.status_code == 200
        parts = self._parts(r.content)
        assert "word/header1.xml" in parts
        assert "word/media/letterhead-header.jpeg" in parts
        assert "word/_rels/header1.xml.rels" in parts

    def test_word_can_resolve_the_header(self, client, admin_headers, bu_letterheads):
        """Parsed by python-docx rather than by string matching: a header part
        that no OOXML reader can resolve is a header that will not print."""
        import docx
        draft_id = _draft(client, admin_headers, "Arai")
        r = client.get(f"/api/authoring/drafts/{draft_id}/export.docx", headers=admin_headers)
        document = docx.Document(io.BytesIO(r.content))
        section = document.sections[0]
        assert not section.header.is_linked_to_previous
        assert str(section.header.part.partname) == "/word/header1.xml"
        media = [str(p.partname) for p in document.part.package.parts if "media" in str(p.partname)]
        assert media == ["/word/media/letterhead-header.jpeg"]

    def test_the_top_margin_clears_the_banner(self, client, admin_headers, bu_letterheads):
        """Word flows text from the margin, so the margin is what keeps the body
        off the artwork — this is the DOCX equivalent of the PDF baseline test."""
        import docx
        draft_id = _draft(client, admin_headers, "Arai")
        r = client.get(f"/api/authoring/drafts/{draft_id}/export.docx", headers=admin_headers)
        section = docx.Document(io.BytesIO(r.content)).sections[0]
        banner_emu = section.page_width * 300 / 1600
        assert section.top_margin >= banner_emu, (section.top_margin, banner_emu)

    def test_plain_paper_has_no_header_part(self, client, admin_headers):
        draft_id = _draft(client, admin_headers, "Arai")
        r = client.get(f"/api/authoring/drafts/{draft_id}/export.docx", headers=admin_headers)
        parts = self._parts(r.content)
        assert "word/header1.xml" not in parts
        assert not any(p.startswith("word/media/") for p in parts)

    @pytest.mark.parametrize("path", ["redline.docx", "export-tracked.docx"])
    def test_the_redline_variants_are_on_letterhead_too(self, client, admin_headers,
                                                        bu_letterheads, path):
        """These go to the counterparty as often as the clean copy does."""
        draft_id = _draft(client, admin_headers, "Arai")
        r = client.get(f"/api/authoring/drafts/{draft_id}/{path}", headers=admin_headers)
        assert r.status_code == 200, r.text
        assert "word/media/letterhead-header.jpeg" in self._parts(r.content)


class TestSignatureDocument:
    def test_the_signing_copy_is_on_letterhead(self, client, admin_headers, bu_letterheads):
        """The copy the counterparty actually signs — the one that most needs to
        carry the right entity's stationery."""
        import types
        from app.database import SessionLocal
        from app.services.esign import build_final_pdf
        draft = types.SimpleNamespace(
            title="Deal", fields={"location": "WWMG"},
            document={"type": "doc", "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Body."}]}]})
        db = SessionLocal()
        try:
            pdf = build_final_pdf(draft, [{"name": "A", "anchor": "/sig1/"}], db=db)
        finally:
            db.close()
        assert _pdf_images(pdf)[0] == [(1600, 300)]
        assert b"/sig1/" in pdf, "the signature anchors must survive"

    def test_without_a_session_it_still_renders(self):
        """build_final_pdf is called from tests and scripts without a database;
        losing the letterhead is acceptable there, failing is not."""
        import types
        from app.services.esign import build_final_pdf
        draft = types.SimpleNamespace(title="Deal", fields={}, document={
            "type": "doc", "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Body."}]}]})
        assert build_final_pdf(draft).startswith(b"%PDF")


class TestVendorCopy:
    def test_the_shared_pdf_is_on_letterhead(self, client, admin_headers, bu_letterheads):
        draft_id = _draft(client, admin_headers, "Arai")
        r = client.post(f"/api/authoring/drafts/{draft_id}/share", headers=admin_headers,
                        json={"recipients": [{"email": "vendor@example.com", "name": "Vendor"}],
                              "allow_download": True, "watermark": True})
        assert r.status_code == 200, r.text
        token = r.json()["links"][0]["token"]
        r = client.get(f"/api/vendor/{token}/document.pdf")
        assert r.status_code == 200, r.text
        assert _pdf_images(r.content)[0] == [(1600, 300)]
