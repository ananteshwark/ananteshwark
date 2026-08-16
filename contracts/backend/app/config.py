"""Application configuration loaded from environment variables."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


class Settings:
    APP_NAME = "Contract Management System"
    API_PREFIX = "/api"

    DATABASE_URL = _env("DATABASE_URL", f"sqlite:///{BASE_DIR / 'cms.db'}")

    # Auth
    JWT_SECRET = _env("JWT_SECRET", "change-me-in-production")
    JWT_ALGORITHM = "HS256"
    JWT_EXPIRY_MINUTES = int(_env("JWT_EXPIRY_MINUTES", "480"))
    # Google Sign-In (OAuth client ID is public; safe to expose to the frontend)
    GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID", "")

    # Claude API — key is read by the anthropic SDK from ANTHROPIC_API_KEY.
    # Never expose it through any API response.
    CLAUDE_MODEL = _env("CLAUDE_MODEL", "claude-opus-4-8")
    CLAUDE_MAX_TOKENS = int(_env("CLAUDE_MAX_TOKENS", "16000"))
    EXTRACTION_MAX_RETRIES = int(_env("EXTRACTION_MAX_RETRIES", "3"))

    # Folder watcher
    WATCH_ROOT = _env("WATCH_ROOT", str(BASE_DIR / "watched"))
    WATCH_ENABLED = _env("WATCH_ENABLED", "true").lower() == "true"
    # Seconds a file's size must remain stable before it is considered complete
    FILE_STABILITY_SECONDS = float(_env("FILE_STABILITY_SECONDS", "3"))
    SUPPORTED_EXTENSIONS = [
        e.strip().lower()
        for e in _env("SUPPORTED_EXTENSIONS", ".pdf,.docx,.jpg,.jpeg,.png").split(",")
        if e.strip()
    ]

    # Google Drive monitoring: local staging dir for downloaded Drive files
    GDRIVE_STAGING = _env("GDRIVE_STAGING", str(BASE_DIR / "gdrive_staging"))

    # Manually-entered contracts: where uploaded documents are stored
    MANUAL_UPLOAD_DIR = _env("MANUAL_UPLOAD_DIR", str(BASE_DIR / "manual_uploads"))

    # Additional per-contract document attachments
    ATTACHMENTS_DIR = _env("ATTACHMENTS_DIR", str(BASE_DIR / "attachments"))

    # Login brute-force protection
    LOGIN_MAX_ATTEMPTS = int(_env("LOGIN_MAX_ATTEMPTS", "5"))
    LOGIN_LOCKOUT_MINUTES = int(_env("LOGIN_LOCKOUT_MINUTES", "15"))

    # Scheduler
    TIMEZONE = _env("TIMEZONE", "Asia/Kolkata")
    REMINDER_RUN_TIME = _env("REMINDER_RUN_TIME", "08:00")  # HH:MM in TIMEZONE

    # SMTP (email channel)
    SMTP_HOST = _env("SMTP_HOST", "localhost")
    SMTP_PORT = int(_env("SMTP_PORT", "25"))
    SMTP_USER = _env("SMTP_USER", "")
    SMTP_PASSWORD = _env("SMTP_PASSWORD", "")
    SMTP_FROM = _env("SMTP_FROM", "cms-reminders@example.com")
    SMTP_TLS = _env("SMTP_TLS", "false").lower() == "true"
    # When true, emails are logged instead of sent (for dev environments)
    EMAIL_DRY_RUN = _env("EMAIL_DRY_RUN", "true").lower() == "true"

    # Validation
    CONFIDENCE_THRESHOLD = float(_env("CONFIDENCE_THRESHOLD", "0.8"))

    APP_BASE_URL = _env("APP_BASE_URL", "http://localhost:5173")


settings = Settings()
