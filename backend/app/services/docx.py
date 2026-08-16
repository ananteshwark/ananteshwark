"""Minimal, dependency-free DOCX (OOXML) writer for the authoring module.

Builds a valid .docx from the structured document model (headings, paragraphs,
merge values) and a redline variant that shows tracked changes as underlined
insertions / struck-through deletions. Pure-Python (zipfile + string XML) so it
works on the air-gapped server without python-docx.
"""
from __future__ import annotations

import io
import zipfile
from xml.sax.saxutils import escape

CONTENT_TYPES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" '
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '<Override PartName="/word/styles.xml" '
    'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    '</Types>'
)
RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" '
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
    'Target="word/document.xml"/></Relationships>'
)
_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

# Document defaults: a serif contract font (Times New Roman, 12pt) so exported
# files retain the look of a typical source contract rather than the Office
# default sans-serif. Referenced from document.xml via DOC_RELS below.
STYLES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    f'<w:styles {_W}><w:docDefaults><w:rPrDefault><w:rPr>'
    '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>'
    '<w:sz w:val="24"/><w:szCs w:val="24"/>'
    '</w:rPr></w:rPrDefault></w:docDefaults></w:styles>'
)
DOC_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" '
    'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
    'Target="styles.xml"/></Relationships>'
)


def _run(text: str, *, bold=False, italic=False, size=None, underline=False, strike=False, color=None) -> str:
    props = []
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
    if size:
        props.append(f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>')
    rpr = f"<w:rPr>{''.join(props)}</w:rPr>" if props else ""
    return f'<w:r>{rpr}<w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def _para(runs: str, *, heading=False, indent=0) -> str:
    spacing = '<w:spacing w:before="160" w:after="80"/>' if heading else '<w:spacing w:after="120"/>'
    ind = f'<w:ind w:left="{indent * 360}"/>' if indent else ""
    # Body text is justified to match the on-screen editor; headings stay left.
    jc = "" if heading else '<w:jc w:val="both"/>'
    return f"<w:p><w:pPr>{spacing}{ind}{jc}</w:pPr>{runs}</w:p>"


def _resolve(field: str, fields: dict) -> str:
    from .authoring import _display
    return _display(field, fields or {})


_MARKS = {"bold", "italic", "underline", "strike"}


def _inline_runs(block: dict, fields: dict, *, heading=False, size=None) -> str:
    """Render a block's inline nodes as runs, honoring bold/italic/underline/strike."""
    parts = []
    for inline in block.get("content", []) or []:
        marks = {m.get("type") for m in (inline.get("marks") or [])}
        style = dict(bold=heading or "bold" in marks, italic="italic" in marks,
                     underline="underline" in marks, strike="strike" in marks, size=size)
        if inline.get("type") == "text":
            parts.append(_run(inline.get("text", ""), **style))
        elif inline.get("type") == "mergeField":
            val = _resolve((inline.get("attrs") or {}).get("field", ""), fields)
            parts.append(_run(val, **style))
    return "".join(parts)


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
            level = (block.get("attrs") or {}).get("level", 2)
            size = 32 if level == 1 else 26
            runs = _inline_runs(block, fields, heading=True, size=size)
            if runs:
                paras.append(_para(runs, heading=True))
        else:
            runs = _inline_runs(block, fields)
            if runs:
                paras.append(_para(runs, indent=depth))


def _body_from_doc(doc: dict, fields: dict) -> str:
    paras: list[str] = []
    _walk_blocks((doc or {}).get("content", []) or [], fields, paras)
    return "".join(paras)


def _package(body_xml: str) -> bytes:
    document = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                f'<w:document {_W}><w:body>{body_xml}'
                f'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
                f'<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>'
                f'</w:body></w:document>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document)
        z.writestr("word/_rels/document.xml.rels", DOC_RELS)
        z.writestr("word/styles.xml", STYLES)
    return buf.getvalue()


def document_to_docx(title: str, doc: dict, fields: dict) -> bytes:
    body = _para(_run(title.upper(), bold=True, size=36), heading=True)
    body += _body_from_doc(doc, fields)
    return _package(body)


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


def document_to_docx_tracked(title: str, doc: dict, fields: dict, changes: list[dict]) -> bytes:
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
    return _package(body)


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


def redline_to_docx(title: str, doc: dict, fields: dict, changes: list[dict]) -> bytes:
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
    return _package(body)
