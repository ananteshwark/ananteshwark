"""Per-business-unit letterhead artwork, and the geometry both writers need.

Each BU here is its own legal entity with its own stationery, so "which paper
does this contract print on" is a property of the draft's business unit, not a
global setting. This module owns three things:

  * storing the artwork — uploads are normalised to JPEG so the PDF and DOCX
    writers have exactly one image format to embed between them;
  * resolving a BU name to its letterhead, falling back to the default row so a
    draft with no BU set still prints on paper;
  * turning the stored pixel dimensions into page geometry (band heights, and
    the text area left over), so the two writers and the on-screen editor all
    agree about where the body starts.

Nothing here decodes an image at render time: the pixel dimensions are measured
once, on upload, and stored.
"""
from __future__ import annotations

import io
import logging
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Letterhead
# US Letter at 72dpi. Shared with the PDF writer rather than restated, so the
# band geometry computed here cannot drift from the page it is computed for.
from .pdf import PAGE_H, PAGE_W

log = logging.getLogger(__name__)

# What an admin may upload. Everything is converted to JPEG on the way in.
LETTERHEAD_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_LETTERHEAD_BYTES = 8 * 1024 * 1024

# Letterhead art is a banner, not a photograph: 2000px across is more than any
# printer needs at this size, and caps what a careless upload can do to the size
# of every document the system generates.
MAX_WIDTH_PX = 2000
JPEG_QUALITY = 88

# Clear space between the artwork and the first/last line of body text. Without
# it the text sits flush against the banner and looks like part of it.
GAP_PT = 18
# Floor under the text area. A letterhead that leaves less page than this is
# rejected at upload rather than producing a document with two lines per page.
MIN_TEXT_HEIGHT_PT = 300


def _dir() -> Path:
    path = Path(settings.LETTERHEAD_DIR)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _normalize(data: bytes) -> tuple[bytes, int, int]:
    """Re-encode an uploaded image as RGB JPEG. Returns (bytes, width, height).

    JPEG because a PDF can carry its bytes verbatim as /DCTDecode, and Word
    embeds it just as happily — one stored format keeps both writers simple.
    Transparency is flattened onto white, which is what the paper is anyway.
    """
    from PIL import Image, UnidentifiedImageError

    try:
        with Image.open(io.BytesIO(data)) as img:
            img.load()
            if img.mode in ("RGBA", "LA", "P"):
                img = img.convert("RGBA")
                flat = Image.new("RGB", img.size, (255, 255, 255))
                flat.paste(img, mask=img.split()[-1])
                img = flat
            elif img.mode != "RGB":
                img = img.convert("RGB")
            if img.width > MAX_WIDTH_PX:
                height = max(1, round(img.height * MAX_WIDTH_PX / img.width))
                img = img.resize((MAX_WIDTH_PX, height), Image.LANCZOS)
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
            return out.getvalue(), img.width, img.height
    except UnidentifiedImageError as exc:
        raise ValueError("That file is not a readable image.") from exc
    except OSError as exc:  # truncated / corrupt file
        raise ValueError(f"That image could not be read: {exc}") from exc


def band_height(width_px: int, height_px: int) -> float:
    """Printed height, in points, of artwork drawn across the full page width.

    Letterheads are designed to run edge to edge, so the art is scaled to the
    paper's width and its height follows from the aspect ratio. Everything else
    — where the text starts, the Word page margin — is derived from this.
    """
    if not width_px or not height_px:
        return 0.0
    return PAGE_W * (float(height_px) / float(width_px))


def geometry_of(header: tuple[int, int] | None, footer: tuple[int, int] | None) -> dict:
    """Page geometry for a pair of band dimensions: how tall each band prints,
    and the text area left between them.

    Takes dimensions rather than a model row because the caller sometimes knows
    that one of the images will not be drawn — a footer whose file has gone
    missing must not keep reserving space at the bottom of every page.

    Returned as plain floats so the PDF writer, the DOCX writer and the API can
    each use it without importing the model.
    """
    header_pt = band_height(*header) if header else 0.0
    footer_pt = band_height(*footer) if footer else 0.0
    return _geometry(header_pt, footer_pt)


def _geometry(header: float, footer: float) -> dict:
    return {
        "header_pt": header,
        "footer_pt": footer,
        # Where body text may start and stop, measured from the bottom of the
        # page (PDF's coordinate system).
        "text_top_pt": PAGE_H - header - (GAP_PT if header else 0),
        "text_bottom_pt": footer + (GAP_PT if footer else 0),
    }


def geometry(lh: Letterhead | None) -> dict:
    """Page geometry for a stored letterhead row."""
    if lh is None:
        return _geometry(0.0, 0.0)
    footer = (lh.footer_w, lh.footer_h) if lh.footer_file else None
    return geometry_of((lh.header_w, lh.header_h), footer)


def text_height_pt(geo: dict) -> float:
    return geo["text_top_pt"] - geo["text_bottom_pt"]


def _fits(header: tuple[int, int] | None, footer: tuple[int, int] | None) -> bool:
    """Would this pair of images leave a usable text area?"""
    return text_height_pt(geometry_of(header, footer)) >= MIN_TEXT_HEIGHT_PT


def normalize_key(business_unit: str | None) -> str:
    """The stored key for a BU name. Blank/None is the default letterhead."""
    return (business_unit or "").strip()


def for_business_unit(db: Session, business_unit: str | None) -> Letterhead | None:
    """The letterhead a draft in this BU prints on, or None if none is set up.

    Matched case-insensitively, because the BU on a draft is free text copied
    from a picker and "North America" and "north america" are the same paper.
    Falls back to the default row so an unset BU is not the same as no
    letterhead at all.
    """
    key = normalize_key(business_unit)
    if key:
        rows = db.query(Letterhead).filter(Letterhead.business_unit != "").all()
        for row in rows:
            if row.business_unit.strip().lower() == key.lower():
                return row
    return db.query(Letterhead).filter(Letterhead.business_unit == "").first()


def for_draft(db: Session, draft) -> Letterhead | None:
    """The letterhead for an authored draft, keyed off its BU register field."""
    return for_business_unit(db, (getattr(draft, "fields", None) or {}).get("location"))


def image_bytes(lh: Letterhead | None, kind: str = "header") -> bytes | None:
    """The stored artwork, or None when it is unset or missing from disk.

    A missing file is a warning, not an error: losing the artwork should degrade
    a contract export to plain paper, never fail the download.
    """
    if lh is None:
        return None
    name = lh.header_file if kind == "header" else lh.footer_file
    if not name:
        return None
    path = _dir() / name
    try:
        return path.read_bytes()
    except OSError:
        log.warning("Letterhead image missing on disk: %s", path)
        return None


def render_spec(db: Session, business_unit: str | None) -> dict | None:
    """Everything a writer needs to print this BU's letterhead, or None.

    ``{"header": (jpeg_bytes, w_px, h_px), "footer": ... or None, **geometry}``.
    Resolving to None — no letterhead configured, or its files have vanished —
    is the signal to render the document on plain paper.
    """
    lh = for_business_unit(db, business_unit)
    header = image_bytes(lh, "header")
    if lh is None or not header:
        return None
    footer = image_bytes(lh, "footer")
    spec = {
        "business_unit": lh.business_unit,
        "header": (header, lh.header_w, lh.header_h),
        "footer": (footer, lh.footer_w, lh.footer_h) if footer else None,
        # The DOCX writer needs this to widen the page margin by the same clear
        # space the PDF writer leaves, so the two land the body text alike.
        "gap_pt": GAP_PT,
    }
    # Geometry has to reflect what will actually be drawn: if the footer file
    # went missing, the text area must grow back or the last band of every page
    # stays blank for no reason.
    spec.update(geometry_of((lh.header_w, lh.header_h),
                            (lh.footer_w, lh.footer_h) if footer else None))
    return spec


def spec_for_draft(db: Session, draft) -> dict | None:
    return render_spec(db, (getattr(draft, "fields", None) or {}).get("location"))


def save_image(db: Session, business_unit: str | None, kind: str, data: bytes,
               user_id: int | None = None) -> Letterhead:
    """Store (or replace) one image of a BU's letterhead.

    Raises ValueError with a message meant for the admin who uploaded it.
    """
    if kind not in ("header", "footer"):
        raise ValueError(f"Unknown letterhead image '{kind}'.")
    key = normalize_key(business_unit)
    jpeg, width, height = _normalize(data)

    row = db.query(Letterhead).filter(Letterhead.business_unit == key).first()
    if row is None and kind == "footer":
        raise ValueError("Upload the header artwork before the footer.")

    # Check the resulting pair leaves a page worth printing on before anything
    # is written — an over-tall banner is an upload mistake, and finding out at
    # export time means a broken document instead of a rejected upload.
    if kind == "header":
        pair = ((width, height), (row.footer_w, row.footer_h) if row and row.footer_file else None)
    else:
        pair = ((row.header_w, row.header_h), (width, height))
    if not _fits(*pair):
        raise ValueError(
            "That artwork is too tall — it would leave less than "
            f"{MIN_TEXT_HEIGHT_PT / 72:.1f} inches of page for the contract text. "
            "Crop it to a banner and try again."
        )

    name = f"{uuid.uuid4().hex}.jpg"
    (_dir() / name).write_bytes(jpeg)

    if row is None:
        row = Letterhead(business_unit=key, header_file=name, header_w=width, header_h=height)
        db.add(row)
    else:
        old = row.header_file if kind == "header" else row.footer_file
        if kind == "header":
            row.header_file, row.header_w, row.header_h = name, width, height
        else:
            row.footer_file, row.footer_w, row.footer_h = name, width, height
        _unlink(old)
    row.updated_by_id = user_id
    db.flush()
    return row


def clear_image(db: Session, business_unit: str | None, kind: str) -> Letterhead | None:
    """Remove the footer artwork, keeping the letterhead itself."""
    if kind != "footer":
        raise ValueError("The header is the letterhead — delete the whole letterhead instead.")
    row = db.query(Letterhead).filter(
        Letterhead.business_unit == normalize_key(business_unit)).first()
    if row is None:
        return None
    _unlink(row.footer_file)
    row.footer_file = row.footer_w = row.footer_h = None
    db.flush()
    return row


def delete(db: Session, business_unit: str | None) -> bool:
    row = db.query(Letterhead).filter(
        Letterhead.business_unit == normalize_key(business_unit)).first()
    if row is None:
        return False
    _unlink(row.header_file)
    _unlink(row.footer_file)
    db.delete(row)
    db.flush()
    return True


def _unlink(name: str | None) -> None:
    if not name:
        return
    try:
        (_dir() / name).unlink(missing_ok=True)
    except OSError as exc:  # pragma: no cover - permissions
        log.warning("Could not remove letterhead image %s: %s", name, exc)


def as_dict(lh: Letterhead) -> dict:
    """The admin-facing view of a letterhead. Never includes the image bytes —
    the artwork is fetched from its own endpoint so the list stays small."""
    geo = geometry(lh)
    return {
        "business_unit": lh.business_unit,
        "is_default": lh.business_unit == "",
        "header": {"width": lh.header_w, "height": lh.header_h,
                   "band_inches": round(geo["header_pt"] / 72, 2)},
        "footer": ({"width": lh.footer_w, "height": lh.footer_h,
                    "band_inches": round(geo["footer_pt"] / 72, 2)}
                   if lh.footer_file else None),
        "text_height_inches": round(text_height_pt(geo) / 72, 2),
        "updated_at": lh.updated_at.isoformat() if lh.updated_at else None,
    }


def list_all(db: Session) -> list[dict]:
    rows = db.query(Letterhead).order_by(Letterhead.business_unit).all()
    return [as_dict(r) for r in rows]
