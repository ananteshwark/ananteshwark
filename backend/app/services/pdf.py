"""Minimal, dependency-free PDF writer for the final contract document.

Renders wrapped text across US-Letter pages using the built-in Helvetica font.
Enough to produce a real PDF for e-signature and to attach to the record; not a
full typesetting engine. Kept pure-Python so it works on the air-gapped server.
"""
from __future__ import annotations

PAGE_W, PAGE_H = 612, 792          # US Letter (points)
MARGIN = 54
FONT_SIZE = 11
LEADING = 16
MAX_CHARS = 92                      # approx chars per line at 11pt Helvetica


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


def _paginate(lines: list[str]) -> list[list[str]]:
    per_page = int((PAGE_H - 2 * MARGIN) // LEADING)
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


def text_to_pdf(title: str, body: str, footer: str | None = None, watermark: str | None = None) -> bytes:
    """Render title + body text into a PDF document (bytes)."""
    lines = [title, ""] + (body or "").split("\n")
    if footer:
        lines += ["", footer]
    pages = _paginate(lines)

    objects: list[bytes] = []

    def add(obj: bytes) -> int:
        objects.append(obj)
        return len(objects)  # 1-based object number

    font_num = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    kids_nums: list[int] = []
    content_nums: list[int] = []
    # Reserve the Pages object number (created after we know kids); build page + content objects
    for page_lines in pages:
        stream_parts = [_watermark_ops(watermark)] if watermark else []
        stream_parts += ["BT", f"/F1 {FONT_SIZE} Tf", f"{LEADING} TL",
                         f"1 0 0 1 {MARGIN} {PAGE_H - MARGIN} Tm"]
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

    pages_num = len(objects) + 1 + len(pages) + 1  # placeholder; fixed below
    # We need the Pages object number before pages reference it. Compute now:
    # objects so far: font + content objects. Next we add page objects, then Pages, then Catalog.
    pages_obj_number = len(objects) + len(pages) + 1

    for content_num in content_nums:
        page_obj = (
            "<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] "
            "/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
            % (pages_obj_number, PAGE_W, PAGE_H, font_num, content_num)
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
