"""Application configuration loaded from environment variables."""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


class Settings:
    APP_NAME = "Contract Management System"
    API_PREFIX = "/api"

    DATABASE_URL = _env("DATABASE_URL", f"sqlite:///{BASE_DIR / 'cms.db'}")

    # Auth
    JWT_SECRET = _env("JWT_SECRET", "")
    JWT_ALGORITHM = "HS256"
    # 60, not a working day. The token lives in localStorage, so anything that
    # can read it holds a valid session for exactly this long — and an 8-hour
    # window is a long time to be someone else. Shortening it is only tolerable
    # because the session slides: auth.get_current_user re-issues the token
    # once a request comes in past the halfway mark, so an active user is never
    # logged out and an abandoned or stolen token dies within the hour.
    JWT_EXPIRY_MINUTES = int(_env("JWT_EXPIRY_MINUTES", "60"))
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

    # Per-business-unit letterhead artwork (printed on every generated document)
    LETTERHEAD_DIR = _env("LETTERHEAD_DIR", str(BASE_DIR / "letterheads"))

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

    # "development" relaxes checks that only make sense on a deployed box. Any
    # other value — including the default — is treated as production.
    ENV = _env("ENV", "production").strip().lower()

    @property
    def is_development(self) -> bool:
        return self.ENV == "development"

    def validate(self) -> None:
        """Refuse to start on a configuration that cannot be secure.

        JWT_SECRET used to default to a fixed string. A default signing key is
        not a weak secret, it is a published one: anyone who can read this
        repository could mint a token for any user id and role, including
        SUPER_ADMIN, and the app would accept it. Nothing detected the missing
        variable — it booted normally and authenticated nobody.

        Checked at import so a misconfigured deploy fails loudly at startup
        rather than serving forgeable sessions. Development is exempted only
        for the JWT length, and even then it must be set to something.
        """
        problems: list[str] = []

        if not self.JWT_SECRET:
            problems.append(
                "JWT_SECRET is not set. Generate one with: openssl rand -hex 32"
            )
        elif self.JWT_SECRET in _KNOWN_BAD_SECRETS:
            problems.append(
                "JWT_SECRET is a placeholder value. Generate a real one with: "
                "openssl rand -hex 32"
            )
        elif len(self.JWT_SECRET) < _MIN_SECRET_LEN and not self.is_development:
            problems.append(
                f"JWT_SECRET must be at least {_MIN_SECRET_LEN} characters "
                f"(got {len(self.JWT_SECRET)}). Generate one with: openssl rand -hex 32"
            )

        # APP_BASE_URL defaults to the Vite dev URL. Left unset in production it
        # is not merely cosmetic: it is the CORS allow-list entry, the host in
        # every reminder and review email, and the base of the no-login
        # renew/terminate links. Every one of those silently points at the
        # reader's own machine.
        if not self.is_development and self.APP_BASE_URL.rstrip("/") in _DEV_BASE_URLS:
            problems.append(
                f"APP_BASE_URL is still the development default "
                f"({self.APP_BASE_URL}). Set it to the address users actually "
                f"reach this server on — email links and CORS both depend on it."
            )

        if not self.is_development and self.APP_BASE_URL.startswith("http://"):
            log.warning(
                "APP_BASE_URL is http://, so session tokens and document "
                "downloads cross the network in clear text: %s", self.APP_BASE_URL
            )

        if problems:
            raise RuntimeError(
                "Refusing to start — insecure configuration:\n  - "
                + "\n  - ".join(problems)
            )


# Values that have appeared as defaults or in documentation, and so are public.
_KNOWN_BAD_SECRETS = {
    "change-me-in-production",
    "changeme",
    "secret",
    "your-secret-key",
    # Shipped in .env.example, so people copy it verbatim.
    "please-change-me-to-a-long-random-string-32b+",
}
_MIN_SECRET_LEN = 32
_DEV_BASE_URLS = {"http://localhost:5173", "http://127.0.0.1:5173"}


settings = Settings()
settings.validate()
