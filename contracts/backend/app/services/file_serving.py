"""Serving stored files without handing the browser something executable.

`FileResponse(path, filename=...)` infers the media type from the extension, so
an uploaded .html or .svg is served as text/html / image/svg+xml. Those files
are previewed in a same-origin <iframe>, which means the upload would run as
script in the app's origin and could read the session token.

Only a small allow-list is served with its real type; everything else is
octet-stream, which browsers download rather than render. `nosniff` stops
content sniffing from re-deriving a rendering type anyway.

contracts_api.get_contract_file already did exactly this inline; this is that
same table, shared so every file endpoint gets it.
"""
from __future__ import annotations

from pathlib import Path

from fastapi.responses import FileResponse

# Types safe to hand a browser inline: not script-bearing, and needed for the
# document preview. Note .svg and .html are deliberately absent — both execute.
INLINE_SAFE_MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

DEFAULT_MEDIA_TYPE = "application/octet-stream"


def media_type_for(path: str | Path) -> str:
    return INLINE_SAFE_MEDIA_TYPES.get(Path(path).suffix.lower(), DEFAULT_MEDIA_TYPE)


def safe_file_response(path: str | Path, filename: str | None = None) -> FileResponse:
    """FileResponse that can't serve a stored upload as executable content."""
    return FileResponse(
        str(path),
        media_type=media_type_for(path),
        filename=filename or Path(path).name,
        headers={"X-Content-Type-Options": "nosniff"},
    )
