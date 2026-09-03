"""Guards for user file uploads: size ceilings and extension allowlists.

A single oversized or wrong-type upload should never exhaust memory or disk on
the air-gapped box, nor let an executable/script masquerade as a contract. These
helpers centralise the checks so every upload endpoint enforces them the same
way. Limits are deliberately generous for legitimate scanned contract documents.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, UploadFile

# 25 MB default — a scanned multi-page contract PDF fits comfortably. nginx also
# caps request bodies (client_max_body_size), so this is defense in depth.
DEFAULT_MAX_BYTES = 25 * 1024 * 1024

# Extension allowlists per upload surface.
DOC_EXTS = {".pdf", ".docx"}
IMPORT_EXTS = {".xlsx", ".xls", ".csv"}
# Attachments are broader but still an allowlist — no executables or scripts.
ATTACHMENT_EXTS = {
    ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".csv", ".txt",
    ".png", ".jpg", ".jpeg", ".tif", ".tiff",
}

_CHUNK = 1024 * 1024


def _ext(filename: str | None) -> str:
    return Path(filename or "").suffix.lower()


def read_upload(
    file: UploadFile,
    *,
    allowed_exts: set[str] | None = None,
    max_bytes: int = DEFAULT_MAX_BYTES,
) -> bytes:
    """Read an UploadFile fully into memory, enforcing an extension allowlist and
    a size ceiling.

    Reads in chunks so an oversized upload is rejected (413) as soon as it
    crosses the limit, without buffering the entire body first. Raises 415 for a
    disallowed extension and 400 for an empty file.
    """
    ext = _ext(file.filename)
    if allowed_exts is not None and ext not in allowed_exts:
        allowed = ", ".join(sorted(allowed_exts))
        raise HTTPException(415, f"Unsupported file type '{ext or '?'}'. Allowed: {allowed}.")

    file.file.seek(0)
    data = bytearray()
    while True:
        chunk = file.file.read(_CHUNK)
        if not chunk:
            break
        data += chunk
        if len(data) > max_bytes:
            raise HTTPException(413, f"File exceeds the {max_bytes // (1024 * 1024)} MB upload limit.")
    if not data:
        raise HTTPException(400, "The uploaded file is empty.")
    return bytes(data)


def save_upload(
    file: UploadFile,
    dest,
    *,
    allowed_exts: set[str] | None = None,
    max_bytes: int = DEFAULT_MAX_BYTES,
) -> int:
    """Validate then write the upload to ``dest``. Returns the bytes written."""
    data = read_upload(file, allowed_exts=allowed_exts, max_bytes=max_bytes)
    with open(dest, "wb") as out:
        out.write(data)
    return len(data)
