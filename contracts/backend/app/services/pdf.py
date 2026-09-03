"""Minimal, dependency-free PDF writer for the final contract document.

Renders wrapped text across US-Letter pages using the built-in Helvetica font,
optionally on a business unit's letterhead. Enough to produce a real PDF for
e-signature and to attach to the record; not a full typesetting engine. Kept
pure-Python so it works on the air-gapped server.

Letterhead art is embedded as a JPEG image XObject — PDF carries JPEG bytes
verbatim under /DCTDecode, so no image codec is needed here either. The artwork
is drawn on *every* page, because a contract's second page going out on blank
paper is the failure this feature exists to prevent.
"""
from __future__ import annotations

PAGE_W, PAGE_H = 612, 792          # US Letter (points)
MARGIN = 54
FONT_SIZE = 11
LEADING = 16
MAX_CHARS = 92                      # approx chars per line at 11pt Helvetica


def _jpeg_size(data: bytes) -> tuple[int, int]:
    """Pixel dimensions from a JPEG's SOF marker.

    A fallback for callers that have the bytes but not the dimensions; the
    letterhead service normally supplies both from the upload, so this is only
    reached when something else hands us an image.
    """
    i = 2
    n = len(data)
    while i + 9 < n:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        # SOF0-SOF15, excluding the non-frame markers DHT/JPG/DAC in that range.
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            height = int.from_bytes(data[i + 5:i + 7], "big")
            width = int.from_bytes(data[i + 7:i + 9], "big")
            return width, height
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        i += 2 + int.from_bytes(data[i + 2:i + 4], "big")
    raise ValueError("Could not read the JPEG's dimensions.")


def _band(spec) -> tuple[bytes, int, int] | None:
    """Normalise one band of a letterhead spec into (bytes, width_px, height_px).

    The spec normally carries the dimensions measured when the artwork was
    uploaded; they are re-read from the JPEG only if a caller left them out.
    """
    if not spec:
        return None
    data = spec[0]
    if not data:
        return None
    width, height = (spec[1], spec[2]) if len(spec) >= 3 else (None, None)
    if width and height:
        return data, int(width), int(height)
    return (data, *_jpeg_size(data))


def _band_pt(band: tuple[bytes, int, int]) -> float:
    """Printed height in points of a band drawn across the full page width."""
    return PAGE_W * (float(band[2]) / float(band[1]))


def _image_ops(name: str, band: tuple[bytes, int, int], y_bottom: float) -> str:
    """Draw one band across the full page width, its bottom edge at ``y_bottom``.

    ``cm`` sets the transform to (width, 0, 0, height, x, y) — for an image
    XObject the unit square maps onto that rectangle, so the scale factors are
    the printed size in points.
    """
    return f"q\n{PAGE_W} 0 0 {_band_pt(band):.2f} 0 {y_bottom:.2f} cm\n/{name} Do\nQ\n"


def _wrap(line: str, width: int = MAX_CHARS) -> list[str]:
    if line == "":
        return [""]
    words = line.split(" ")
    out, cur = [], ""
    for w in words:
        if len(cur) + len(w) + (1 if cur else 0) <= width:
            cur = f"{cur} {w}".strip()
        else:
            if cur:
                out.append(cur)
            cur = w
            while len(cur) > width:                 # hard-break very long tokens
                out.append(cur[:width])
                cur = cur[width:]
    out.append(cur)
    return out


def _escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _paginate(lines: list[str], top: float, bottom: float) -> list[list[str]]:
    """Split wrapped lines into pages that fit between ``bottom`` and ``top``.

    Both bounds are y-coordinates from the foot of the page, so a letterhead
    simply lowers ``top`` and raises ``bottom`` and the text flows into what is
    left. At least one line per page, or an absurd letterhead would loop.
    """
    per_page = max(1, int((top - bottom) // LEADING))
    wrapped: list[str] = []
    for ln in lines:
        wrapped.extend(_wrap(ln))
    pages = [wrapped[i:i + per_page] for i in range(0, len(wrapped), per_page)] or [[]]
    return pages


def _watermark_ops(text: str) -> str:
    """A faint, diagonal watermark drawn once per page (wrapped in q…Q)."""
    esc = _escape(text)
    # ~45° rotation matrix; light gray fill so it sits behind the body text.
    return ("q\n0.9 0.9 0.9 rg\nBT\n/F1 64 Tf\n"
            "0.707 0.707 -0.707 0.707 120 250 Tm\n"
            f"({esc}) Tj\nET\nQ\n")


def text_to_pdf(title: str, body: str, footer: str | None = None, watermark: str | None = None,
                letterhead: dict | None = None) -> bytes:
    """Render title + body text into a PDF document (bytes).

    ``letterhead`` is a render spec from services.letterhead: the artwork to
    draw on every page and the text area it leaves. Passing None (or a spec the
    caller could not resolve) renders on plain paper, unchanged.
    """
    head = _band(letterhead.get("header")) if letterhead else None
    foot = _band(letterhead.get("footer")) if letterhead else None
    # Fall back to the full page when there is no letterhead, so the plain-paper
    # layout is byte-for-byte what it was before this feature existed.
    text_top = letterhead["text_top_pt"] if letterhead else PAGE_H - MARGIN
    text_bottom = letterhead["text_bottom_pt"] if letterhead else MARGIN
    if head or foot:
        # The banner runs to the paper's edge, but the text still needs its side
        # margins and must not touch the art.
        text_top = min(text_top, PAGE_H - MARGIN)
        text_bottom = max(text_bottom, MARGIN)

    lines = [title, ""] + (body or "").split("\n")
    if footer:
        lines += ["", footer]
    pages = _paginate(lines, text_top, text_bottom)

    objects: list[bytes] = []

    def add(obj: bytes) -> int:
        objects.append(obj)
        return len(objects)  # 1-based object number

    font_num = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    # One XObject per band, shared by every page: the artwork is embedded once
    # however long the contract runs.
    xobjects: list[tuple[str, int]] = []
    band_ops = ""
    for name, band, y_bottom in (
        ("Im1", head, PAGE_H - (_band_pt(head) if head else 0)),
        ("Im2", foot, 0.0),
    ):
        if not band:
            continue
        data, width_px, height_px = band
        num = add(
            b"<< /Type /XObject /Subtype /Image /Width %d /Height %d "
            b"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length %d >>\n"
            b"stream\n%s\nendstream" % (width_px, height_px, len(data), data)
        )
        xobjects.append((name, num))
        band_ops += _image_ops(name, band, y_bottom)

    kids_nums: list[int] = []
    content_nums: list[int] = []
    # Reserve the Pages object number (created after we know kids); build page + content objects
    for page_lines in pages:
        # Letterhead first so the body text and any watermark sit on top of it.
        stream_parts = [band_ops] if band_ops else []
        if watermark:
            stream_parts.append(_watermark_ops(watermark))
        stream_parts += ["BT", f"/F1 {FONT_SIZE} Tf", f"{LEADING} TL",
                         f"1 0 0 1 {MARGIN} {text_top:.2f} Tm"]
        first = True
        for ln in page_lines:
            if first:
                stream_parts.append(f"({_escape(ln)}) Tj")
                first = False
            else:
                stream_parts.append(f"T* ({_escape(ln)}) Tj")
        stream_parts.append("ET")
        stream = "\n".join(stream_parts).encode("latin-1", "replace")
        content_num = add(b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream))
        content_nums.append(content_num)

    # The Pages object comes after every page object, which is what each page
    # names as its /Parent — so its number is "everything so far, plus one page
    # object each, plus one".
    pages_obj_number = len(objects) + len(pages) + 1

    xobject_res = ""
    if xobjects:
        entries = " ".join(f"/{name} {num} 0 R" for name, num in xobjects)
        xobject_res = f" /XObject << {entries} >>"

    for content_num in content_nums:
        page_obj = (
            "<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] "
            "/Resources << /Font << /F1 %d 0 R >>%s >> /Contents %d 0 R >>"
            % (pages_obj_number, PAGE_W, PAGE_H, font_num, xobject_res, content_num)
        ).encode()
        kids_nums.append(add(page_obj))

    kids = " ".join(f"{n} 0 R" for n in kids_nums)
    pages_num = add(("<< /Type /Pages /Count %d /Kids [%s] >>" % (len(kids_nums), kids)).encode())
    catalog_num = add(("<< /Type /Catalog /Pages %d 0 R >>" % pages_num).encode())

    # Serialize with xref
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref_pos = len(out)
    out += b"xref\n"
    out += f"0 {len(objects) + 1}\n".encode()
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode()
    out += b"trailer\n"
    out += f"<< /Size {len(objects) + 1} /Root {catalog_num} 0 R >>\n".encode()
    out += b"startxref\n" + f"{xref_pos}\n".encode() + b"%%EOF"
    return bytes(out)
