"""Minimal, dependency-free DOCX (OOXML) writer for the authoring module.

Builds a valid .docx from the structured document model (headings, paragraphs,
merge values) and a redline variant that shows tracked changes as underlined
insertions / struck-through deletions. Pure-Python (zipfile + string XML) so it
works on the air-gapped server without python-docx.

A document can be printed on a business unit's letterhead. The artwork goes in a
Word *header* part, which is what makes it repeat on every page, and each image
is anchored to the page rather than placed in the text flow — the same way Word
itself builds full-bleed stationery, so the banner reaches the paper's edge
instead of being inset by the text margins.
"""
from __future__ import annotations

import io
import zipfile
from xml.sax.saxutils import escape

# Word measures in twentieths of a point (twips) and DrawingML in English Metric
# Units. Both appear throughout the letterhead code below.
TWIPS_PER_PT = 20
EMU_PER_PT = 12700
# US Letter, matching services/pdf.py.
PAGE_W_TWIPS, PAGE_H_TWIPS = 12240, 15840
BODY_MARGIN_TWIPS = 1440

_TYPE_HEADER = ('application/vnd.openxmlformats-officedocument'
                '.wordprocessingml.header+xml')


def _content_types(letterhead: bool = False) -> str:
    extra = (f'<Default Extension="jpeg" ContentType="image/jpeg"/>'
             f'<Override PartName="/word/header1.xml" ContentType="{_TYPE_HEADER}"/>'
             if letterhead else '')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f'{extra}'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '</Types>'
    )


CONTENT_TYPES = _content_types()
RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" '
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
    'Target="word/document.xml"/></Relationships>'
)
_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
_R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
# DrawingML, needed only by the header part that carries the letterhead images.
_DRAWING_NS = (
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
)

# Document defaults: a serif contract font (Times New Roman, 12pt) so exported
# files retain the look of a typical source contract rather than the Office
# default sans-serif. Referenced from document.xml via _doc_rels() below.
STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    f'<w:styles {_W}><w:docDefaults><w:rPrDefault><w:rPr>'
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'
    '<w:sz w:val="24"/><w:szCs w:val="24"/>'
    '</w:rPr></w:rPrDefault></w:docDefaults></w:styles>'
)


def _hex(value: str | None) -> str | None:
    """A CSS colour as Word wants it: six hex digits, no leading '#'.

    Anything that is not a plain hex colour (a named colour, rgb(), a gradient)
    is dropped rather than written out — Word renders an unparseable value as
    black, which silently changes the document.
    """
    v = (value or "").strip().lstrip("#")
    if len(v) == 3 and all(c in "0123456789abcdefABCDEF" for c in v):
        v = "".join(c * 2 for c in v)
    if len(v) == 6 and all(c in "0123456789abcdefABCDEF" for c in v):
        return v.upper()
    return None


def _half_points(css_size: str | None) -> int | None:
    """A CSS font size in Word's half-points. Only pt and px are meaningful for
    a printed contract; px is converted at the usual 0.75 ratio."""
    s = (css_size or "").strip().lower()
    try:
        if s.endswith("pt"):
            return max(2, int(round(float(s[:-2]) * 2)))
        if s.endswith("px"):
            return max(2, int(round(float(s[:-2]) * 0.75 * 2)))
    except ValueError:
        return None
    return None


def _first_font(css_family: str | None) -> str | None:
    """The first family in a CSS stack, unquoted — Word takes one name, not a
    fallback list."""
    first = (css_family or "").split(",")[0].strip().strip("'\"")
    return first or None


def _run(text: str, *, bold=False, italic=False, size=None, underline=False, strike=False,
         color=None, font=None, highlight=None, vert_align=None) -> str:
    props = []
    if font:
        props.append(f'<w:rFonts w:ascii="{escape(font)}" w:hAnsi="{escape(font)}" '
                     f'w:cs="{escape(font)}"/>')
    if bold:
        props.append("<w:b/>")
    if italic:
        props.append("<w:i/>")
    if underline:
        props.append('<w:u w:val="single"/>')
    if strike:
        props.append("<w:strike/>")
    if color:
        props.append(f'<w:color w:val="{color}"/>')
    if highlight:
        # w:highlight only accepts a fixed palette of names; cell shading takes
        # any colour, which is what the editor's swatches produce.
        props.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{highlight}"/>')
    if vert_align:
        props.append(f'<w:vertAlign w:val="{vert_align}"/>')
    if size:
        props.append(f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>')
    rpr = f"<w:rPr>{''.join(props)}</w:rPr>" if props else ""
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


# CSS text-align -> Word justification.
_ALIGN = {"left": "left", "center": "center", "right": "right", "justify": "both"}


def _para(runs: str, *, heading=False, indent=0, align=None, line_height=None,
          quote=False) -> str:
    spacing_attrs = ('w:before="160" w:after="80"' if heading else 'w:after="120"')
    if line_height:
        # Word takes line spacing in 240ths of a line ("auto" rule).
        spacing_attrs += f' w:line="{int(round(line_height * 240))}" w:lineRule="auto"'
    spacing = f"<w:spacing {spacing_attrs}/>"
    left = indent * 360 + (720 if quote else 0)
    ind = f'<w:ind w:left="{left}"/>' if left else ""
    # An explicit alignment from the editor wins. Otherwise body text is
    # justified to match the on-screen editor and headings stay left.
    val = _ALIGN.get(align or "")
    jc = f'<w:jc w:val="{val}"/>' if val else ("" if heading else '<w:jc w:val="both"/>')
    return f"<w:p><w:pPr>{spacing}{ind}{jc}</w:pPr>{runs}</w:p>"


def _hr() -> str:
    """A horizontal rule: an empty paragraph carrying a bottom border."""
    return ('<w:p><w:pPr><w:pBdr>'
            '<w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/>'
            "</w:pBdr></w:pPr></w:p>")


def _resolve(field: str, fields: dict) -> str:
    from .authoring import _display
    return _display(field, fields or {})


_MARKS = {"bold", "italic", "underline", "strike"}


def _inline_style(inline: dict, *, heading: bool, size) -> dict:
    """Word run properties for one inline node.

    The editor offers colour, font, size, highlight and sub/superscript as well
    as the four basic marks. They were dropped here, so an author who formatted
    a schedule saw it revert the moment the draft was exported — the reason to
    go back to Word, which is what the editor exists to avoid.
    """
    by_type = {m.get("type"): (m.get("attrs") or {}) for m in (inline.get("marks") or [])}
    text_style = by_type.get("textStyle") or {}
    style = dict(
        bold=heading or "bold" in by_type,
        italic="italic" in by_type,
        underline="underline" in by_type,
        strike="strike" in by_type,
        size=_half_points(text_style.get("fontSize")) or size,
        color=_hex(text_style.get("color")),
        font=_first_font(text_style.get("fontFamily")),
        highlight=_hex((by_type.get("highlight") or {}).get("color")) if "highlight" in by_type else None,
    )
    if "superscript" in by_type:
        style["vert_align"] = "superscript"
    elif "subscript" in by_type:
        style["vert_align"] = "subscript"
    return style


def _inline_runs(block: dict, fields: dict, *, heading=False, size=None) -> str:
    """Render a block's inline nodes as runs, honoring every mark the editor can
    apply."""
    parts = []
    for inline in block.get("content", []) or []:
        style = _inline_style(inline, heading=heading, size=size)
        if inline.get("type") == "text":
            parts.append(_run(inline.get("text", ""), **style))
        elif inline.get("type") == "mergeField":
            val = _resolve((inline.get("attrs") or {}).get("field", ""), fields)
            parts.append(_run(val, **style))
    return "".join(parts)


def _line_height(block: dict) -> float | None:
    """Line spacing set on the block's first inline run.

    TipTap's LineHeight is a textStyle attribute, so it lives on the runs; Word
    sets it on the paragraph. Taking the first run's value is the honest
    approximation — mixed spacing within one paragraph is not a thing Word can
    represent anyway.
    """
    for inline in block.get("content", []) or []:
        for m in inline.get("marks") or []:
            if m.get("type") == "textStyle":
                raw = (m.get("attrs") or {}).get("lineHeight")
                try:
                    return float(raw) if raw else None
                except (TypeError, ValueError):
                    return None
    return None


def _walk_blocks(blocks, fields, paras, *, list_kind=None, depth=0):
    counter = 0
    for block in blocks or []:
        btype = block.get("type")
        if btype in ("bulletList", "orderedList"):
            _walk_blocks(block.get("content"), fields, paras, list_kind=btype, depth=depth + 1)
        elif btype == "listItem":
            counter += 1
            children = block.get("content") or []
            if children:
                marker = f"{counter}. " if list_kind == "orderedList" else "• "
                runs = _run(marker) + _inline_runs(children[0], fields)
                paras.append(_para(runs, indent=depth))
                _walk_blocks(children[1:], fields, paras, depth=depth)
        elif btype == "heading":
            attrs = block.get("attrs") or {}
            level = attrs.get("level", 2)
            size = 32 if level == 1 else 26
            runs = _inline_runs(block, fields, heading=True, size=size)
            if runs:
                paras.append(_para(runs, heading=True, align=attrs.get("textAlign"),
                                   line_height=_line_height(block)))
        elif btype == "horizontalRule":
            paras.append(_hr())
        elif btype in ("blockquote", "codeBlock"):
            # A quote indents its children; a code block is one preformatted
            # paragraph. Both were previously rendered as ordinary body text.
            if btype == "codeBlock":
                runs = _inline_runs(block, fields)
                if runs:
                    paras.append(_para(runs, indent=depth, quote=True))
            else:
                for child in block.get("content") or []:
                    runs = _inline_runs(child, fields)
                    if runs:
                        paras.append(_para(runs, indent=depth, quote=True,
                                           align=(child.get("attrs") or {}).get("textAlign")))
        else:
            runs = _inline_runs(block, fields)
            if runs:
                paras.append(_para(runs, indent=depth,
                                   align=(block.get("attrs") or {}).get("textAlign"),
                                   line_height=_line_height(block)))


def _body_from_doc(doc: dict, fields: dict) -> str:
    paras: list[str] = []
    _walk_blocks((doc or {}).get("content", []) or [], fields, paras)
    return "".join(paras)


# ---------------------------------------------------------------------------
# Letterhead: a header part carrying page-anchored artwork
# ---------------------------------------------------------------------------

def _anchor(rel_id: str, name: str, cx: int, cy: int, y_emu: int, doc_pr_id: int) -> str:
    """One page-anchored, behind-the-text image spanning the paper's full width.

    Anchored rather than inline because an inline image lives in the text flow
    and would be inset by the page margins; a `page`-relative anchor is measured
    from the paper's edge, which is where letterhead artwork belongs. behindDoc
    keeps it under the body text, as a printed letterhead would be.
    """
    return (
        '<w:r><w:drawing>'
        '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" '
        'relativeHeight="0" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1">'
        '<wp:simplePos x="0" y="0"/>'
        '<wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH>'
        f'<wp:positionV relativeFrom="page"><wp:posOffset>{y_emu}</wp:posOffset></wp:positionV>'
        f'<wp:extent cx="{cx}" cy="{cy}"/>'
        '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
        '<wp:wrapNone/>'
        f'<wp:docPr id="{doc_pr_id}" name="{escape(name)}"/>'
        '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>'
        '<a:graphic><a:graphicData '
        'uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>'
        f'<pic:nvPicPr><pic:cNvPr id="{doc_pr_id}" name="{escape(name)}"/>'
        '<pic:cNvPicPr/></pic:nvPicPr>'
        f'<pic:blipFill><a:blip r:embed="{rel_id}"/>'
        '<a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        f'<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{cx}" cy="{cy}"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
        '</pic:pic></a:graphicData></a:graphic>'
        '</wp:anchor></w:drawing></w:r>'
    )


def _band_twips(width_px: int, height_px: int) -> int:
    """Printed height, in twips, of artwork scaled across the full page width."""
    if not width_px or not height_px:
        return 0
    return int(round(PAGE_W_TWIPS * (float(height_px) / float(width_px))))


def _emu(twips: int) -> int:
    """Twips to EMU: 20 twips to the point, 12700 EMU to the point."""
    return int(round(twips * EMU_PER_PT / TWIPS_PER_PT))


def _header_part(letterhead: dict) -> tuple[str, dict]:
    """The header XML and the media parts it references.

    Both bands live in the one header part: they are anchored to the page, so
    the part that repeats on every page can place art at the foot just as well
    as at the head, and one part is half the plumbing of two.
    """
    anchors, media = "", {}
    head = letterhead.get("header")
    foot = letterhead.get("footer")
    cx = _emu(PAGE_W_TWIPS)          # edge to edge

    if head and head[0]:
        media["rId1"] = ("letterhead-header.jpeg", head[0])
        cy = _emu(_band_twips(head[1], head[2]))
        anchors += _anchor("rId1", "Letterhead", cx, cy, 0, 1)
    if foot and foot[0]:
        media["rId2"] = ("letterhead-footer.jpeg", foot[0])
        cy = _emu(_band_twips(foot[1], foot[2]))
        # Anchored from the top of the page, so the foot of the art sits on the
        # foot of the paper.
        anchors += _anchor("rId2", "Letterhead footer", cx, cy, _emu(PAGE_H_TWIPS) - cy, 2)

    # The carrier paragraph is deliberately as short as Word will make it: the
    # images float, so any height this paragraph has is pure padding pushing the
    # body text down the page.
    xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<w:hdr {_W} {_R} {_DRAWING_NS}>'
        '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>'
        '<w:rPr><w:sz w:val="2"/></w:rPr></w:pPr>'
        f'{anchors}</w:p></w:hdr>'
    )
    return xml, media


def _sect_pr(letterhead: dict | None) -> str:
    """Page setup, with the margins opened up to clear the letterhead art."""
    top, bottom = BODY_MARGIN_TWIPS, BODY_MARGIN_TWIPS
    header_ref = ""
    if letterhead:
        gap = int(round(letterhead.get("gap_pt", 18) * TWIPS_PER_PT))
        head, foot = letterhead.get("header"), letterhead.get("footer")
        if head and head[0]:
            top = max(top, _band_twips(head[1], head[2]) + gap)
        if foot and foot[0]:
            bottom = max(bottom, _band_twips(foot[1], foot[2]) + gap)
        header_ref = '<w:headerReference w:type="default" r:id="rId2"/>'
    return (
        f'<w:sectPr>{header_ref}'
        f'<w:pgSz w:w="{PAGE_W_TWIPS}" w:h="{PAGE_H_TWIPS}"/>'
        f'<w:pgMar w:top="{top}" w:right="{BODY_MARGIN_TWIPS}" w:bottom="{bottom}" '
        f'w:left="{BODY_MARGIN_TWIPS}" w:header="0" w:footer="0"/></w:sectPr>'
    )


def _doc_rels(letterhead: bool = False) -> str:
    header = ('<Relationship Id="rId2" '
              'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" '
              'Target="header1.xml"/>' if letterhead else '')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
        f'Target="styles.xml"/>{header}</Relationships>'
    )


def _media_rels(media: dict) -> str:
    rels = "".join(
        '<Relationship Id="%s" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
        'Target="media/%s"/>' % (rid, name)
        for rid, (name, _) in sorted(media.items())
    )
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'{rels}</Relationships>')


def _package(body_xml: str, letterhead: dict | None = None) -> bytes:
    on_letterhead = bool(letterhead and letterhead.get("header") and letterhead["header"][0])
    document = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document {_W} {_R}><w:body>{body_xml}'
                f'{_sect_pr(letterhead if on_letterhead else None)}'
                f'</w:body></w:document>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", _content_types(on_letterhead))
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document)
        z.writestr("word/_rels/document.xml.rels", _doc_rels(on_letterhead))
        z.writestr("word/styles.xml", STYLES)
        if on_letterhead:
            header_xml, media = _header_part(letterhead)
            z.writestr("word/header1.xml", header_xml)
            z.writestr("word/_rels/header1.xml.rels", _media_rels(media))
            for name, data in media.values():
                z.writestr(f"word/media/{name}", data)
    return buf.getvalue()


def document_to_docx(title: str, doc: dict, fields: dict, letterhead: dict | None = None) -> bytes:
    body = _para(_run(title.upper(), bold=True, size=36), heading=True)
    body += _body_from_doc(doc, fields)
    return _package(body, letterhead)


# ---------------------------------------------------------------------------
# Native Word tracked changes (w:ins / w:del) for the .docx round-trip (G5).
# ---------------------------------------------------------------------------

_DEFAULT_DATE = "2024-01-01T00:00:00Z"


def _ins(text: str, author: str, date: str, ctr: list[int]) -> str:
    ctr[0] += 1
    return (f'<w:ins w:id="{ctr[0]}" w:author="{escape(author)}" w:date="{escape(date)}">'
            f'<w:r><w:rPr><w:color w:val="008000"/><w:u w:val="single"/></w:rPr>'
            f'<w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:ins>')


def _del(text: str, author: str, date: str, ctr: list[int]) -> str:
    ctr[0] += 1
    return (f'<w:del w:id="{ctr[0]}" w:author="{escape(author)}" w:date="{escape(date)}">'
            f'<w:r><w:rPr><w:color w:val="C00000"/><w:strike/></w:rPr>'
            f'<w:delText xml:space="preserve">{escape(text)}</w:delText></w:r></w:del>')


def _block_plain(block: dict, fields: dict) -> str:
    out = []
    for inline in block.get("content") or []:
        if inline.get("type") == "text":
            out.append(inline.get("text", ""))
        elif inline.get("type") == "mergeField":
            out.append(_resolve((inline.get("attrs") or {}).get("field", ""), fields))
    return "".join(out)


def _tracked_para_runs(text: str, changes: list[dict], ctr: list[int]) -> str:
    """Runs for one paragraph, splicing in real tracked deletions/insertions
    where a change's original text is found. Each change is consumed once."""
    pending = list(changes)
    runs: list[str] = []
    remaining = text
    while pending and remaining:
        best = None  # (index_in_remaining, change, original)
        for c in pending:
            orig = c.get("original_text") or ""
            if not orig:
                continue
            i = remaining.find(orig)
            if i >= 0 and (best is None or i < best[0]):
                best = (i, c, orig)
        if best is None:
            break
        i, c, orig = best
        if i > 0:
            runs.append(_run(remaining[:i]))
        author = c.get("author_email") or "reviewer"
        date = c.get("date") or _DEFAULT_DATE
        runs.append(_del(orig, author, date, ctr))
        if c.get("change_type") != "DELETE" and c.get("proposed_text"):
            runs.append(_ins(c["proposed_text"], author, date, ctr))
        remaining = remaining[i + len(orig):]
        pending.remove(c)
    if remaining:
        runs.append(_run(remaining))
    return "".join(runs) or _run(text)


def document_to_docx_tracked(title: str, doc: dict, fields: dict, changes: list[dict],
                             letterhead: dict | None = None) -> bytes:
    """Export the draft as a .docx carrying native Word tracked changes: each
    REPLACE/DELETE is spliced inline as a real revision, and INSERTs are appended
    as inserted paragraphs. Word (and this module's importer) can accept/reject
    them, so a redline survives the app → Word → app round-trip."""
    ctr = [1000]
    inline = [c for c in changes if (c.get("change_type") in ("REPLACE", "DELETE")) and c.get("original_text")]
    inserts = [c for c in changes if c.get("change_type") == "INSERT" and c.get("proposed_text")]

    body = _para(_run(title.upper(), bold=True, size=36), heading=True)
    for block in (doc or {}).get("content", []) or []:
        btype = block.get("type")
        if btype == "heading":
            level = (block.get("attrs") or {}).get("level", 2)
            size = 32 if level == 1 else 26
            body += _para(_inline_runs(block, fields, heading=True, size=size), heading=True)
        elif btype == "paragraph":
            text = _block_plain(block, fields)
            if text:
                body += _para(_tracked_para_runs(text, inline, ctr))
        else:
            _tmp: list[str] = []
            _walk_blocks([block], fields, _tmp)
            body += "".join(_tmp)
    for c in inserts:
        author = c.get("author_email") or "reviewer"
        date = c.get("date") or _DEFAULT_DATE
        body += _para(_ins(c["proposed_text"], author, date, ctr))
    return _package(body, letterhead)


def parse_tracked_changes(data: bytes) -> list[dict]:
    """Parse a redlined .docx and return its tracked changes in document order:
    [{type: 'insert'|'delete', text, author, date}]. Runs inside <w:ins>/<w:del>
    are read from <w:t>/<w:delText>. Adjacent runs of the same revision merge."""
    import xml.etree.ElementTree as ET

    W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            xml = z.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile) as exc:
        raise ValueError(f"Not a readable .docx: {exc}")
    root = ET.fromstring(xml)

    out: list[dict] = []

    def _text_of(el, tag) -> str:
        return "".join(t.text or "" for t in el.iter(f"{{{W}}}{tag}"))

    for el in root.iter():
        tag = el.tag
        if tag == f"{{{W}}}ins":
            text = _text_of(el, "t")
            if text:
                out.append({"type": "insert", "text": text,
                            "author": el.get(f"{{{W}}}author") or "",
                            "date": el.get(f"{{{W}}}date") or ""})
        elif tag == f"{{{W}}}del":
            text = _text_of(el, "delText")
            if text:
                out.append({"type": "delete", "text": text,
                            "author": el.get(f"{{{W}}}author") or "",
                            "date": el.get(f"{{{W}}}date") or ""})
    return out


def tracked_changes_to_records(revisions: list[dict]) -> list[dict]:
    """Fold a flat list of insert/delete revisions into TrackedChange-shaped
    dicts: a delete immediately followed by an insert (same author) is a REPLACE;
    lone inserts/deletes stay INSERT/DELETE."""
    records: list[dict] = []
    i = 0
    n = len(revisions)
    while i < n:
        r = revisions[i]
        nxt = revisions[i + 1] if i + 1 < n else None
        if (r["type"] == "delete" and nxt and nxt["type"] == "insert"
                and (r.get("author") or "") == (nxt.get("author") or "")):
            records.append({"change_type": "REPLACE", "original_text": r["text"],
                            "proposed_text": nxt["text"], "author_email": r.get("author") or None})
            i += 2
            continue
        if r["type"] == "insert":
            records.append({"change_type": "INSERT", "original_text": None,
                            "proposed_text": r["text"], "author_email": r.get("author") or None})
        else:
            records.append({"change_type": "DELETE", "original_text": r["text"],
                            "proposed_text": None, "author_email": r.get("author") or None})
        i += 1
    return records


def redline_to_docx(title: str, doc: dict, fields: dict, changes: list[dict],
                    letterhead: dict | None = None) -> bytes:
    """Clean document followed by a redline section: each proposed change with
    its deletion (struck-through) and insertion (underlined) and disposition."""
    body = _para(_run(title.upper(), bold=True, size=36), heading=True)
    body += _body_from_doc(doc, fields)
    body += _para(_run("PROPOSED CHANGES (REDLINE)", bold=True, size=28), heading=True)
    if not changes:
        body += _para(_run("No vendor changes recorded."))
    for c in changes:
        header = f"{c.get('clause_type') or 'General'} — {c.get('change_type')} " \
                 f"[{c.get('disposition', 'PENDING')}] by {c.get('author_email') or 'vendor'}"
        body += _para(_run(header, bold=True))
        if c.get("original_text"):
            body += _para(_run("− ", bold=True, color="C00000") +
                          _run(c["original_text"], strike=True, color="C00000"))
        if c.get("proposed_text"):
            body += _para(_run("+ ", bold=True, color="008000") +
                          _run(c["proposed_text"], underline=True, color="008000"))
        if c.get("rationale"):
            body += _para(_run(f"Vendor rationale: {c['rationale']}", size=20))
        if c.get("disposition_reason"):
            body += _para(_run(f"Decision: {c['disposition_reason']}", size=20))
        if c.get("countered_text"):
            body += _para(_run(f"Counter: {c['countered_text']}", size=20))
    return _package(body, letterhead)
