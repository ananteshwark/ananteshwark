"""FastAPI application entry point."""
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import require_admin

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.APP_BASE_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
    # Defense-in-depth security headers. nginx sets these for the served SPA;
    # setting them here too covers direct-to-backend access and dev.
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    return response

for router in (
    auth_api.router,
    ingestion_api.router,
    contracts_api.router,
    duplicates_api.router,
    vendors_api.router,
    departments_api.router,
    rules_api.router,
    dashboard_api.router,
    reports_api.router,
    settings_api.router,
    tags_api.router,
    saved_filters_api.router,
    retention_api.router,
    notifications_api.router,
    audit_api.router,
    authoring_api.router,
    clauses_api.router,
    contract_action_api.router,
    vendor_api.router,
    esign_api.router,
    internal_entities_api.router,
    requests_api.router,
    tasks_api.router,
    repository_ai_api.router,
    obligations_api.router,
    payments_api.router,
    custom_fields_api.router,
    report_builder_api.router,
    public_api.router,
    api_tokens_api.router,
    compliance_api.router,
    fx_api.router,
    approval_action_api.router,
    ai_governance_api.router,
    portfolio_api.router,
):
    app.include_router(router, prefix=settings.API_PREFIX)


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
