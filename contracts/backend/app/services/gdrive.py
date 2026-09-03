"""Google Drive folder monitoring (second ingestion source).

An admin configures a service-account credential (JSON) and one or more Drive
folder IDs. A background poller lists those folders recursively, downloads any
file it has not imported before into a local staging directory, and hands it to
the same `register_file` ingestion path used for local folders — so SHA-256
dedupe, extraction, validation, duplicate detection and reminders all apply
unchanged.

A Drive file is imported once (tracked by its Drive file id in
`ingestion_files.external_id`). Google-native Docs are exported to PDF; other
Google-native types (Sheets/Slides) are skipped as they are not contract
documents.
"""
import io
import json
import logging
import threading
from pathlib import Path

from ..database import SessionLocal
from ..models import IngestionFile, IngestionStatus
from .settings_store import get_setting

log = logging.getLogger(__name__)

DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
_FOLDER_MIME = "application/vnd.google-apps.folder"
_GOOGLE_DOC_MIME = "application/vnd.google-apps.document"


class GoogleDriveError(Exception):
    pass


def supported_extensions(db) -> list[str]:
    return [e.strip().lower() for e in get_setting(db, "supported_extensions").split(",") if e.strip()]


def is_supported_drive_file(meta: dict, extensions: list[str]) -> bool:
    """A Drive file is importable if it's a Google Doc (exported to PDF) or its
    name ends with a supported extension."""
    mime = meta.get("mimeType", "")
    if mime == _FOLDER_MIME:
        return False
    if mime == _GOOGLE_DOC_MIME:
        return ".pdf" in extensions
    name = (meta.get("name") or "").lower()
    return any(name.endswith(ext) for ext in extensions)


def select_new_drive_files(existing_external_ids: set[str], drive_files: list[dict]) -> list[dict]:
    """Pure helper: Drive files not already imported (by file id). Testable."""
    return [f for f in drive_files if f.get("id") not in existing_external_ids]


def parse_folder_ids(raw: str) -> list[str]:
    return [line.strip() for line in raw.replace(",", "\n").splitlines() if line.strip()]


def service_account_email(credentials_json: str) -> str | None:
    """The client_email from the service-account JSON — the address a Drive
    folder must be shared with. Used to make access errors actionable."""
    try:
        return json.loads(credentials_json).get("client_email")
    except (json.JSONDecodeError, TypeError, AttributeError):
        return None


def _friendly_drive_error(exc: Exception, folder_id: str, sa_email: str | None) -> str:
    """Translate a Drive API failure into an actionable message for the admin."""
    msg = str(exc)
    status = getattr(getattr(exc, "resp", None), "status", None)
    who = f" ({sa_email})" if sa_email else ""
    if status in (404,) or "notFound" in msg:
        return (f"Folder {folder_id}: not found or not visible to the service account"
                f"{who}. Check the folder ID and share the folder with that account.")
    if status in (401, 403) or any(w in msg.lower() for w in ("forbidden", "insufficient", "permission")):
        return (f"Folder {folder_id}: access denied for the service account{who}. "
                f"Share the folder (Viewer) and ensure the Drive API is enabled for the project.")
    return f"Folder {folder_id}: listing failed — {msg}"


def _summarize_report(report: dict) -> str:
    if report["errors"]:
        if len(report["errors"]) == 1:
            return report["errors"][0]
        return f"{len(report['errors'])} problem(s): " + "; ".join(report["errors"][:3])
    if report["imported"]:
        return f"Imported {report['imported']} new file(s)."
    if report["seen"] == 0:
        return ("Connected, but the configured folder(s) returned no files. Confirm the "
                "folder ID(s) and that each is shared with the service account.")
    return f"Up to date — {report['seen']} file(s) seen, nothing new to import."


def _build_service(credentials_json: str):
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError as exc:  # optional dependency, only needed when Drive is on
        raise GoogleDriveError(
            "google-api-python-client / google-auth not installed — required for "
            "Google Drive monitoring"
        ) from exc
    try:
        info = json.loads(credentials_json)
    except (json.JSONDecodeError, TypeError) as exc:
        raise GoogleDriveError("Google Drive service-account credentials are not valid JSON") from exc
    creds = service_account.Credentials.from_service_account_info(info, scopes=DRIVE_SCOPES)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _list_folder(service, folder_id: str) -> list[dict]:
    """List all non-trashed files under a folder, recursing into subfolders."""
    files: list[dict] = []
    stack = [folder_id]
    seen_folders: set[str] = set()
    while stack:
        current = stack.pop()
        if current in seen_folders:
            continue
        seen_folders.add(current)
        page_token = None
        while True:
            resp = service.files().list(
                q=f"'{current}' in parents and trashed=false",
                fields="nextPageToken, files(id,name,mimeType,modifiedTime,size)",
                pageSize=1000,
                pageToken=page_token,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            ).execute()
            for meta in resp.get("files", []):
                if meta.get("mimeType") == _FOLDER_MIME:
                    stack.append(meta["id"])
                else:
                    files.append(meta)
            page_token = resp.get("nextPageToken")
            if not page_token:
                break
    return files


def _download(service, meta: dict, dest: Path) -> Path:
    from googleapiclient.http import MediaIoBaseDownload

    if meta.get("mimeType") == _GOOGLE_DOC_MIME:
        request = service.files().export_media(fileId=meta["id"], mimeType="application/pdf")
        if dest.suffix.lower() != ".pdf":
            dest = dest.with_suffix(".pdf")
    else:
        request = service.files().get_media(fileId=meta["id"], supportsAllDrives=True)

    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _status, done = downloader.next_chunk()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(buffer.getvalue())
    return dest


class GoogleDriveWatcher:
    """Polls configured Drive folders on an interval in a background thread."""

    def __init__(self, extraction_queue):
        self.extraction_queue = extraction_queue
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._lock = threading.Lock()

    def _config(self) -> dict:
        db = SessionLocal()
        try:
            return {
                "enabled": get_setting(db, "gdrive_enabled") == "true",
                "folder_ids": parse_folder_ids(get_setting(db, "gdrive_folder_ids")),
                "credentials": get_setting(db, "gdrive_credentials_json"),
                "poll_seconds": max(30, int(get_setting(db, "gdrive_poll_seconds") or 300)),
                "staging_dir": get_setting(db, "gdrive_staging_dir") or "./gdrive_staging",
                "extensions": supported_extensions(db),
            }
        finally:
            db.close()

    def poll_once(self) -> int:
        """Import any new files from all configured Drive folders. Returns count."""
        return self.poll_report()["imported"]

    def poll_report(self) -> dict:
        """Run a poll and return a detailed report (for the admin "Poll now"
        button): per-folder counts and actionable errors, so a zero-import poll
        explains *why* (disabled, no credentials, folder not shared, …)."""
        cfg = self._config()
        sa_email = service_account_email(cfg["credentials"]) if cfg["credentials"] else None
        report: dict = {
            "enabled": cfg["enabled"],
            "service_account_email": sa_email,
            "folders": [],
            "imported": 0,
            "seen": 0,
            "errors": [],
            "ok": True,
            "message": "",
        }

        if not cfg["enabled"]:
            report["ok"] = False
            report["message"] = "Google Drive monitoring is off — set it to On and save first."
            return report
        if not cfg["folder_ids"]:
            report["ok"] = False
            report["message"] = "No Drive folder IDs are configured."
            return report
        if not cfg["credentials"]:
            report["ok"] = False
            report["message"] = "No service-account credentials JSON is configured."
            return report

        try:
            service = _build_service(cfg["credentials"])
        except GoogleDriveError as exc:
            report["ok"] = False
            report["errors"].append(str(exc))
            report["message"] = str(exc)
            return report

        staging = Path(cfg["staging_dir"])
        try:
            staging.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            report["ok"] = False
            report["message"] = f"Cannot create staging directory {staging}: {exc}"
            report["errors"].append(report["message"])
            return report

        db = SessionLocal()
        try:
            existing_ids = {
                row[0]
                for row in db.query(IngestionFile.external_id)
                .filter(IngestionFile.external_id.isnot(None))
                .filter(IngestionFile.status != IngestionStatus.FAILED)
                .all()
            }
        finally:
            db.close()

        for folder_id in cfg["folder_ids"]:
            fr = {"id": folder_id, "listed": 0, "candidates": 0, "imported": 0, "error": None}
            try:
                drive_files = _list_folder(service, folder_id)
            except Exception as exc:
                fr["error"] = _friendly_drive_error(exc, folder_id, sa_email)
                report["errors"].append(fr["error"])
                report["ok"] = False
                log.exception("Google Drive listing failed for folder %s", folder_id)
                report["folders"].append(fr)
                continue
            fr["listed"] = len(drive_files)
            report["seen"] += len(drive_files)
            candidates = [f for f in drive_files if is_supported_drive_file(f, cfg["extensions"])]
            fr["candidates"] = len(candidates)
            for meta in select_new_drive_files(existing_ids, candidates):
                try:
                    safe_name = Path(meta["name"]).name or meta["id"]
                    dest = staging / folder_id / f"{meta['id']}__{safe_name}"
                    dest = _download(service, meta, dest)
                    from .watcher import register_file

                    register_file(
                        dest,
                        cfg["staging_dir"],
                        self.extraction_queue,
                        source="GDRIVE",
                        external_id=meta["id"],
                        subfolder_label=f"gdrive:{folder_id}",
                    )
                    existing_ids.add(meta["id"])
                    fr["imported"] += 1
                    report["imported"] += 1
                except Exception as exc:
                    err = f"Import failed for {meta.get('name')} ({meta.get('id')}): {exc}"
                    report["errors"].append(err)
                    report["ok"] = False
                    log.exception("Failed to import Drive file %s (%s)", meta.get("name"), meta.get("id"))
            report["folders"].append(fr)

        if report["imported"]:
            log.info("Google Drive poll imported %d new file(s)", report["imported"])
        report["message"] = _summarize_report(report)
        return report

    def _loop(self):
        # Small initial delay so the app finishes starting before the first poll
        self._stop.wait(5)
        while not self._stop.is_set():
            try:
                self.poll_once()
            except GoogleDriveError as exc:
                log.warning("Google Drive poll skipped: %s", exc)
            except Exception:
                log.exception("Google Drive poll loop error")
            interval = self._config()["poll_seconds"]
            self._stop.wait(interval)

    def start(self):
        with self._lock:
            cfg = self._config()
            if not cfg["enabled"]:
                log.info("Google Drive monitoring disabled by configuration")
                return
            self._stop.clear()
            self._thread = threading.Thread(target=self._loop, daemon=True, name="gdrive-watcher")
            self._thread.start()
            log.info("Google Drive monitoring started (%d folder(s), every %ds)",
                     len(cfg["folder_ids"]), cfg["poll_seconds"])

    def restart(self):
        self.stop()
        self.start()

    def stop(self):
        with self._lock:
            self._stop.set()
            self._thread = None
