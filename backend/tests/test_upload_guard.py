"""Upload size/type hardening on the ingestion + attachment surfaces."""
import io

import pytest

from app.services.upload_guard import (
    ATTACHMENT_EXTS,
    DOC_EXTS,
    IMPORT_EXTS,
    read_upload,
)


class _FakeUpload:
    """Minimal stand-in for FastAPI's UploadFile for the unit-level checks."""

    def __init__(self, filename, data):
        self.filename = filename
        self.file = io.BytesIO(data)


def test_read_upload_rejects_disallowed_extension():
    from fastapi import HTTPException

    up = _FakeUpload("evil.exe", b"MZ\x90\x00")
    with pytest.raises(HTTPException) as ei:
        read_upload(up, allowed_exts=ATTACHMENT_EXTS)
    assert ei.value.status_code == 415


def test_read_upload_rejects_oversize():
    from fastapi import HTTPException

    up = _FakeUpload("big.pdf", b"x" * 2048)
    with pytest.raises(HTTPException) as ei:
        read_upload(up, allowed_exts=DOC_EXTS, max_bytes=1024)
    assert ei.value.status_code == 413


def test_read_upload_rejects_empty():
    from fastapi import HTTPException

    up = _FakeUpload("empty.pdf", b"")
    with pytest.raises(HTTPException) as ei:
        read_upload(up, allowed_exts=DOC_EXTS)
    assert ei.value.status_code == 400


def test_read_upload_accepts_allowed():
    up = _FakeUpload("register.csv", b"a,b,c\n1,2,3\n")
    data = read_upload(up, allowed_exts=IMPORT_EXTS)
    assert data.startswith(b"a,b,c")


def test_import_endpoint_rejects_bad_type(client, admin_headers):
    # A .txt is not an accepted register format -> 415 before parsing.
    files = {"file": ("notes.txt", io.BytesIO(b"hello"), "text/plain")}
    r = client.post("/api/contracts/import?dry_run=true", headers=admin_headers, files=files)
    assert r.status_code == 415


def test_draft_import_rejects_bad_type(client, admin_headers):
    files = {"file": ("script.sh", io.BytesIO(b"#!/bin/sh\n"), "application/x-sh")}
    r = client.post("/api/authoring/drafts/import", headers=admin_headers, files=files)
    assert r.status_code == 415
