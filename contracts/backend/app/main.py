"""FastAPI application entry point."""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import require_admin, require_page

from . import runtime
from .config import settings
from .database import Base, SessionLocal, engine
from .models import PromptTemplate
from .api import (
    ai_governance_api,
    audit_api,
    auth_api,
    authoring_api,
    api_tokens_api,
    approval_action_api,
    clauses_api,
    compliance_api,
    contracts_api,
    custom_fields_api,
    dashboard_api,
    fx_api,
    esign_api,
    internal_entities_api,
    departments_api,
    duplicates_api,
    ingestion_api,
    notifications_api,
    obligations_api,
    payments_api,
    portfolio_api,
    public_api,
    report_builder_api,
    reports_api,
    repository_ai_api,
    retention_api,
    requests_api,
    rules_api,
    saved_filters_api,
    settings_api,
    tasks_api,
    tags_api,
    contract_action_api,
    vendor_api,
    vendors_api,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def ensure_default_prompt() -> None:
    """Seed the versioned Claude extraction prompt on first boot."""
    db = SessionLocal()
    try:
        if db.query(PromptTemplate).count() == 0:
            path = Path(__file__).parent / "prompts" / "contract_extraction_v1.md"
            db.add(PromptTemplate(
                name="contract_extraction", version=1,
                content=path.read_text(), is_active=True,
            ))
            db.commit()
            log.info("Seeded default extraction prompt (v1)")
    finally:
        db.close()


def ensure_internal_entities() -> None:
    """One‑time migration: if the internal‑entity master is empty, seed it from
    the legacy `organization_entities` setting so existing config carries over."""
    from .models import InternalEntity
    from .services.org_entities import parse_entities
    from .services.settings_store import get_setting
    db = SessionLocal()
    try:
        if db.query(InternalEntity).count() == 0:
            names = parse_entities(get_setting(db, "organization_entities"))
            for name in names:
                db.add(InternalEntity(name=name, aliases=[]))
            if names:
                db.commit()
                log.info("Seeded %d internal entities from organization_entities setting", len(names))
    finally:
        db.close()


# Users that should always hold the top-level SUPER_ADMIN role. Promotion is
# idempotent and only applies to an already-provisioned account (we never create
# a login here) — safe to run on every boot.
SUPER_ADMIN_EMAILS = ("ananteshwar.m@ikshealth.com",)


def ensure_super_admins() -> None:
    """Promote the designated operator account(s) to SUPER_ADMIN if present."""
    from .models import User, UserRole
    db = SessionLocal()
    try:
        for email in SUPER_ADMIN_EMAILS:
            user = db.query(User).filter(User.email == email).first()
            if user is not None and user.role != UserRole.SUPER_ADMIN:
                user.role = UserRole.SUPER_ADMIN
                db.commit()
                log.info("Promoted %s to SUPER_ADMIN", email)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    from .migrations import run_migrations
    run_migrations()
    ensure_default_prompt()
    ensure_internal_entities()
    ensure_super_admins()

    # Reconcile the application version / build counter with the deployed commit
    # (auto-increments the build number when a new build is deployed).
    try:
        from .database import SessionLocal
        from .services.version import sync_version

        db = SessionLocal()
        try:
            sync_version(db)
        finally:
            db.close()
    except Exception:
        log.exception("Version sync failed (non-fatal)")

    background_enabled = os.environ.get("CMS_BACKGROUND_SERVICES", "true").lower() == "true"
    scheduler = None
    if background_enabled:
        from .services.extraction_worker import extraction_queue, start_worker
        from .services.gdrive import GoogleDriveWatcher
        from .services.scheduler import start_scheduler
        from .services.watcher import FolderWatcher

        start_worker()
        runtime.watcher_instance = FolderWatcher(extraction_queue)
        runtime.watcher_instance.start()
        runtime.gdrive_watcher_instance = GoogleDriveWatcher(extraction_queue)
        runtime.gdrive_watcher_instance.start()
        scheduler = start_scheduler()
    yield
    if runtime.watcher_instance is not None:
        runtime.watcher_instance.stop()
    if runtime.gdrive_watcher_instance is not None:
        runtime.gdrive_watcher_instance.stop()
    if scheduler is not None:
        from .services.scheduler import stop_scheduler
        stop_scheduler()


app = FastAPI(title=settings.APP_NAME, lifespan=lifespan)

def _cors_origins() -> list[str]:
    origins = [settings.APP_BASE_URL]
    if settings.is_development:
        origins.append("http://localhost:5173")
    return origins


app.add_middleware(
    CORSMiddleware,
    # The Vite dev origin used to be trusted unconditionally, in production,
    # with credentials — so anything a signed-in user could be induced to load
    # on localhost:5173 could read authenticated responses. It is now only
    # trusted when ENV=development.
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    # Response headers are hidden from JS cross-origin unless named here. The
    # sliding session is delivered in one, so without this the client silently
    # never sees a refreshed token and users get logged out on the hour.
    expose_headers=["X-Refresh-Token"],
)


@app.middleware("http")
async def _observability(request, call_next):
    """Record per-route latency/counts and stamp a response-time header."""
    import time as _time

    from .services import metrics

    start = _time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (_time.perf_counter() - start) * 1000
    # Use the matched route template (not the raw path) to keep cardinality low.
    route = request.scope.get("route")
    label = getattr(route, "path", None) or request.url.path
    metrics.record(f"{request.method} {label}", response.status_code, elapsed_ms)
    response.headers["X-Response-Time-ms"] = f"{elapsed_ms:.1f}"
    # Defense-in-depth security headers. nginx sets these for the served SPA
    # (see docs/DEPLOYMENT.md — that is where they do the real work, since the
    # HTML document and every asset come from nginx); setting them here too
    # covers direct-to-backend access and dev.
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    # Deliberately NOT `default-src 'none'`, tempting as it is here. Several
    # endpoints return a PDF via FileResponse, and default-src also covers
    # object-src, which is what the browser's built-in PDF viewer renders
    # through. Those endpoints need a bearer token today, so nothing can
    # navigate to them directly and the point is moot — but moving auth to
    # cookies would make direct navigation possible and turn this into silently
    # broken downloads. These three directives carry the protection that
    # actually applies to an API response and none of that risk.
    response.headers.setdefault(
        "Content-Security-Policy",
        "frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    )
    return response

# Router -> page key from services/page_access.PAGES, or None for routers that
# are not behind a single page.
#
# A key here makes the admin's Page Access setting enforced for that router, on
# top of the endpoints' own role gates (see auth.require_page — it can only
# restrict). Routers are listed with None where a page gate would be wrong
# rather than omitted, so adding a router forces the question to be answered:
#
#   auth_api          sign-in and the user directory; gating it would lock
#                     people out of the app they are being denied a page in.
#   settings_api      serves /settings/page-access itself, which every client
#                     reads to build its navigation. Gating it on "settings"
#                     (admin-only) would break the nav for everyone else.
#   authoring_api     one router behind five pages (authoring, drafts,
#                     templates, redline, reviews) with different role sets; a
#                     single router-level key would be wrong for four of them.
#   reports_api       also serves /search, which is used from pages other than
#                     Reports.
#   public_api        authenticated by API token, not by a user role.
#   the remainder     shared lookups (departments, tags, saved filters,
#                     notifications, custom fields, FX, ...) read from many
#                     pages; they have no single owning page.
ROUTER_PAGES: list[tuple[object, str | None]] = [
    (auth_api.router, None),
    (ingestion_api.router, "ingestion"),
    (contracts_api.router, "contracts"),
    (duplicates_api.router, "duplicates"),
    (vendors_api.router, "vendors"),
    (departments_api.router, None),
    (rules_api.router, "rules"),
    (dashboard_api.router, "dashboard"),
    (reports_api.router, None),
    (settings_api.router, None),
    (tags_api.router, None),
    (saved_filters_api.router, None),
    (retention_api.router, "retention"),
    (notifications_api.router, None),
    (audit_api.router, "audit"),
    (authoring_api.router, None),
    (clauses_api.router, "clauses"),
    (contract_action_api.router, "contracts"),
    (vendor_api.router, "vendors"),
    (esign_api.router, "signatures"),
    (internal_entities_api.router, None),
    (requests_api.router, "requests"),
    (tasks_api.router, "tasks"),
    (repository_ai_api.router, "repository_ai"),
    (obligations_api.router, "obligations"),
    (payments_api.router, None),
    (custom_fields_api.router, None),
    (report_builder_api.router, "report_builder"),
    (public_api.router, None),
    (api_tokens_api.router, None),
    (compliance_api.router, None),
    (fx_api.router, None),
    (approval_action_api.router, None),
    (ai_governance_api.router, "ai_governance"),
    (portfolio_api.router, "portfolio"),
]

for router, page_key in ROUTER_PAGES:
    app.include_router(
        router,
        prefix=settings.API_PREFIX,
        dependencies=[Depends(require_page(page_key))] if page_key else [],
    )


@app.get("/api/health")
def health():
    """Liveness — the process is up."""
    return {"status": "ok"}


@app.get("/api/version")
def version():
    """Application version (MAJOR.MINOR.BUILD) — public, shown in the UI."""
    from .services.version import get_version

    return get_version()


@app.get("/api/metrics")
def metrics(_: object = Depends(require_admin)):
    """In-process request metrics (admin) for basic observability."""
    from .services.metrics import snapshot
    return snapshot()


@app.get("/api/health/ready")
def readiness():
    """Readiness — dependencies (the database) are reachable."""
    from fastapi import Response
    from sqlalchemy import text

    from .database import engine

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready", "database": "ok"}
    except Exception as exc:
        return Response(
            content=f'{{"status": "not_ready", "database": "error: {exc}"}}',
            media_type="application/json", status_code=503,
        )
