"""Application version: MAJOR.MINOR from the committed VERSION file, plus a
zero-padded BUILD counter that auto-increments once per deployed build.

The build counter lives in the DB (AppSetting), so it survives redeploys that
overwrite the code on disk. Each offline tarball is stamped with its git commit
(see _build_stamp.py); on startup we compare that commit to the last one we
recorded — when it changed, a new build was deployed and the counter ticks up.
The result is rendered as e.g. ``1.0.007``.
"""
import logging
from pathlib import Path

from .settings_store import get_setting, set_setting

log = logging.getLogger(__name__)

# repo layout: backend/app/services/version.py -> repo root is three parents up
_REPO_ROOT = Path(__file__).resolve().parents[3]
_VERSION_FILE = _REPO_ROOT / "VERSION"

# DB setting keys
_BUILD_NUMBER = "app_build_number"
_BUILD_COMMIT = "app_build_commit"
_BUILD_DATE = "app_build_date"

_cache: dict | None = None


def _base_version() -> tuple[int, int]:
    """MAJOR.MINOR from the VERSION file (defaults to 1.0 if absent/malformed)."""
    try:
        parts = _VERSION_FILE.read_text().strip().split(".")
        return int(parts[0]), (int(parts[1]) if len(parts) > 1 else 0)
    except (OSError, ValueError, IndexError):
        return 1, 0


def _build_signature() -> tuple[str | None, str | None]:
    """(commit, iso_date) for this build, or (None, None) in a plain checkout."""
    try:
        from .. import _build_stamp as stamp
    except Exception:
        return None, None
    commit = getattr(stamp, "BUILD_COMMIT", "") or ""
    date = getattr(stamp, "BUILD_DATE", "") or ""
    commit = commit if commit and not commit.startswith("$Format") else None
    date = date if date and not date.startswith("$Format") else None
    return commit, date


def format_version(major: int, minor: int, build: int) -> str:
    """Render as MAJOR.MINOR.BBB (build zero-padded to at least three digits)."""
    return f"{major}.{minor}.{build:03d}"


def sync_version(db) -> dict:
    """Reconcile the build counter with the deployed commit and cache the result.

    Called once at startup. Increments the persisted build number the first time
    a new commit is seen (i.e. an upgrade); a fresh database adopts the current
    build as its ``1.0.000`` baseline without incrementing.
    """
    global _cache
    major, minor = _base_version()
    commit, build_date = _build_signature()

    try:
        build = int(get_setting(db, _BUILD_NUMBER) or "0")
    except ValueError:
        build = 0
    last_commit = get_setting(db, _BUILD_COMMIT)

    changed = False
    if not last_commit:
        # First run on this database — adopt the current build as the baseline.
        set_setting(db, _BUILD_COMMIT, commit or "")
        if build_date:
            set_setting(db, _BUILD_DATE, build_date)
        changed = True
    elif commit and commit != last_commit:
        # A different commit is deployed: a new build/upgrade — tick the counter.
        build += 1
        set_setting(db, _BUILD_NUMBER, str(build))
        set_setting(db, _BUILD_COMMIT, commit)
        if build_date:
            set_setting(db, _BUILD_DATE, build_date)
        changed = True
    if changed:
        db.commit()

    _cache = {
        "version": format_version(major, minor, build),
        "major": major,
        "minor": minor,
        "build": build,
        "commit": (commit[:12] if commit else None),
        "build_date": get_setting(db, _BUILD_DATE) or build_date,
    }
    log.info("Application version %s (build %s)", _cache["version"], commit or "dev")
    return _cache


def get_version() -> dict:
    """Return the cached version, computing it read-only if not yet synced."""
    if _cache is not None:
        return _cache
    from ..database import SessionLocal

    db = SessionLocal()
    try:
        return sync_version(db)
    finally:
        db.close()
