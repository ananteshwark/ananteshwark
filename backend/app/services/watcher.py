"""Folder monitoring & file ingestion (Module 1).

- Watches the configured root folder recursively (new subfolders included —
  watchdog observers with recursive=True pick them up automatically).
- Ignores temp/partial files and waits until a file's size is stable.
- Computes SHA-256; identical hashes are logged as file-level duplicates and
  skipped; new files are registered QUEUED and pushed to the extraction queue.
- On startup a reconciliation scan registers files dropped while offline.
"""
import hashlib
import logging
import os
import threading
import time
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

from ..database import SessionLocal
from ..models import IngestionFile, IngestionStatus
from .settings_store import get_setting, get_watch_roots

log = logging.getLogger(__name__)

_IGNORE_PREFIXES = ("~$", ".")
_IGNORE_SUFFIXES = (".tmp", ".part", ".crdownload", ".partial", ".swp")


def sha256_of_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def is_candidate_file(path: Path, extensions: list[str]) -> bool:
    name = path.name.lower()
    if any(name.startswith(p) for p in _IGNORE_PREFIXES):
        return False
    if any(name.endswith(s) for s in _IGNORE_SUFFIXES):
        return False
    return path.suffix.lower() in extensions


def wait_until_stable(path: Path, stability_seconds: float, timeout: float = 300) -> bool:
    """Return True once the file size has stopped changing (write completed)."""
    deadline = time.monotonic() + timeout
    try:
        last_size = path.stat().st_size
    except OSError:
        return False
    while time.monotonic() < deadline:
        time.sleep(stability_seconds)
        try:
            size = path.stat().st_size
        except OSError:
            return False
        if size == last_size and size > 0:
            return True
        last_size = size
    return False


def register_file(
    path: Path,
    watch_root: str,
    extraction_queue,
    source: str = "LOCAL",
    external_id: str | None = None,
    subfolder_label: str | None = None,
) -> IngestionFile | None:
    """Hash the file, dedupe, and either log a duplicate or queue extraction.

    `source`/`external_id` tag non-local origins (e.g. Google Drive) so a remote
    file is imported once; `subfolder_label` overrides the derived subfolder for
    remote sources where a filesystem-relative path is not meaningful.
    """
    db = SessionLocal()
    try:
        abs_path = str(path.resolve())
        # Skip if this exact path was already registered
        existing_path = (
            db.query(IngestionFile)
            .filter(IngestionFile.path == abs_path)
            .filter(IngestionFile.status != IngestionStatus.FAILED)
            .first()
        )
        if existing_path is not None:
            return None

        file_hash = sha256_of_file(path)
        if subfolder_label is not None:
            subfolder = subfolder_label
        else:
            try:
                subfolder = str(path.parent.resolve().relative_to(Path(watch_root).resolve()))
            except ValueError:
                subfolder = str(path.parent)

        original = (
            db.query(IngestionFile)
            .filter(IngestionFile.sha256 == file_hash)
            .filter(IngestionFile.status != IngestionStatus.DUPLICATE)
            .order_by(IngestionFile.id)
            .first()
        )
        record = IngestionFile(
            path=abs_path,
            filename=path.name,
            subfolder=subfolder,
            sha256=file_hash,
            size_bytes=path.stat().st_size,
            source=source,
            external_id=external_id,
        )
        if original is not None:
            record.status = IngestionStatus.DUPLICATE
            record.duplicate_of_id = original.id
            record.error = f"File-level duplicate of ingestion #{original.id} ({original.filename})"
            log.info("Duplicate file detected: %s (matches #%s)", path, original.id)
        else:
            record.status = IngestionStatus.QUEUED
        db.add(record)
        db.commit()
        db.refresh(record)

        if record.status == IngestionStatus.QUEUED and extraction_queue is not None:
            extraction_queue.put(record.id)
        return record
    finally:
        db.close()


class _Handler(FileSystemEventHandler):
    def __init__(self, watcher: "FolderWatcher"):
        self.watcher = watcher

    def on_created(self, event):
        if not event.is_directory:
            self.watcher.handle_new_file(Path(event.src_path))

    def on_moved(self, event):
        if not event.is_directory:
            self.watcher.handle_new_file(Path(event.dest_path))


class FolderWatcher:
    """Runs a watchdog observer plus a startup reconciliation scan."""

    def __init__(self, extraction_queue):
        self.extraction_queue = extraction_queue
        self.observer: Observer | None = None
        self._lock = threading.Lock()

    def _config(self) -> tuple[list[str], list[str], float, bool]:
        db = SessionLocal()
        try:
            roots = get_watch_roots(db)
            exts = [e.strip().lower() for e in get_setting(db, "supported_extensions").split(",") if e.strip()]
            stability = float(get_setting(db, "file_stability_seconds"))
            enabled = get_setting(db, "watch_enabled") == "true"
            return roots, exts, stability, enabled
        finally:
            db.close()

    @staticmethod
    def _root_for(path: Path, roots: list[str]) -> str:
        """Find which configured root a detected file belongs to."""
        resolved = path.resolve()
        for root in roots:
            try:
                resolved.relative_to(Path(root).resolve())
                return root
            except (ValueError, OSError):
                continue
        return roots[0] if roots else str(path.parent)

    def handle_new_file(self, path: Path):
        roots, exts, stability, _ = self._config()
        if not is_candidate_file(path, exts):
            return
        root = self._root_for(path, roots)

        def worker():
            if wait_until_stable(path, stability):
                try:
                    register_file(path, root, self.extraction_queue)
                except Exception:
                    log.exception("Failed to register file %s", path)

        threading.Thread(target=worker, daemon=True).start()

    def reconcile(self):
        """Register files dropped while the service was offline."""
        roots, exts, _, _ = self._config()
        count = 0
        for root in roots:
            root_path = Path(root)
            if not root_path.exists():
                log.warning("Watch root %s does not exist; creating it", root)
                root_path.mkdir(parents=True, exist_ok=True)
                continue
            for dirpath, _dirs, files in os.walk(root_path):
                for name in files:
                    path = Path(dirpath) / name
                    if is_candidate_file(path, exts):
                        try:
                            if register_file(path, root, self.extraction_queue) is not None:
                                count += 1
                        except Exception:
                            log.exception("Reconciliation failed for %s", path)
        log.info("Reconciliation scan complete: %d new file(s) registered", count)

    def start(self):
        with self._lock:
            roots, _, _, enabled = self._config()
            if not enabled:
                log.info("Folder watching disabled by configuration")
                return
            for root in roots:
                Path(root).mkdir(parents=True, exist_ok=True)
            self.reconcile()
            self.observer = Observer()
            for root in roots:
                self.observer.schedule(_Handler(self), root, recursive=True)
            self.observer.daemon = True
            self.observer.start()
            log.info("Watching %d folder(s) recursively: %s", len(roots), ", ".join(roots))

    def restart(self):
        """Apply changed watch settings (root path, filters)."""
        with self._lock:
            if self.observer is not None:
                self.observer.stop()
                self.observer = None
        self.start()

    def stop(self):
        with self._lock:
            if self.observer is not None:
                self.observer.stop()
                self.observer = None
