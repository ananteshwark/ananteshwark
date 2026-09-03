"""Shared pytest fixtures. Sets a temp file DB and disables background services
before any app module is imported, so the API integration tests exercise the
real app (routers, auth, DB) against an isolated database."""
import os
import pathlib
import tempfile

# Must be set before app.config / app.database are imported anywhere.
os.environ["CMS_BACKGROUND_SERVICES"] = "false"
os.environ.setdefault("JWT_SECRET", "test-secret-key-at-least-32-bytes-long-000000")
# The suite is a development environment: config.validate() refuses the
# localhost APP_BASE_URL and short secrets outside development.
os.environ.setdefault("ENV", "development")
# Letterhead artwork is written to disk. Without this it lands in the source
# tree next to the app package, and a test run leaves uploaded images behind.
os.environ.setdefault(
    "LETTERHEAD_DIR", str(pathlib.Path(tempfile.gettempdir()) / "cms_pytest_letterheads")
)
# The suite runs on SQLite by default and the product runs on Postgres, and
# that gap is where the bugs live — JSON columns declared TEXT, pgvector
# aborting a transaction, a missing enum label all passed here and failed in
# production. CMS_TEST_DATABASE_URL points the whole suite at a real Postgres
# so CI can run it both ways.
#
# Deliberately NOT DATABASE_URL: that variable is very likely already set to
# something real in a developer's shell, and this suite creates and drops
# tables. Capturing it by accident would be unrecoverable, so opting in takes
# a name that can only have been set on purpose.
_EXTERNAL = os.environ.get("CMS_TEST_DATABASE_URL", "").strip()
if _EXTERNAL:
    if "test" not in _EXTERNAL.rsplit("/", 1)[-1].lower():
        raise RuntimeError(
            "CMS_TEST_DATABASE_URL must name a database with 'test' in it — "
            f"refusing to run a schema-dropping suite against {_EXTERNAL!r}"
        )
    os.environ["DATABASE_URL"] = _EXTERNAL
else:
    _DB = pathlib.Path(tempfile.gettempdir()) / "cms_pytest.db"
    _DB.unlink(missing_ok=True)
    os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session", autouse=True)
def _fresh_schema():
    """Start from an empty schema on an external database.

    The SQLite path gets this free by deleting the file. A reused Postgres
    would otherwise carry rows between runs, and tests that count or assert on
    "the only row" would pass once and then fail.

    Dropping the whole schema rather than calling Base.metadata.drop_all():
    drop_all() topologically sorts the tables and raises CircularDependencyError
    on the contracts <-> ingestion_files cycle, so it cannot drop this schema at
    all. DROP SCHEMA ... CASCADE has no such ordering problem, and it also
    removes the native ENUM types — which metadata.drop_all() leaves behind, and
    which are exactly what goes stale when a new enum label is added.

    The "test" check on the database name above is what makes this safe.
    """
    if not _EXTERNAL:
        yield
        return
    from sqlalchemy import text

    from app.database import engine
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    yield


@pytest.fixture(scope="session")
def client():
    from app.auth import hash_password
    from app.database import SessionLocal
    from app.main import app
    from app.models import User, UserRole

    with TestClient(app) as c:  # lifespan creates tables + seeds the prompt
        db = SessionLocal()
        if not db.query(User).filter(User.email == "admin@example.com").first():
            db.add(User(
                email="admin@example.com", name="Test Admin",
                hashed_password=hash_password("adminpass123"), role=UserRole.ADMIN,
            ))
            db.commit()
        db.close()
        yield c


def _token(client, email, password):
    """Sign in and return the bearer token, leaving no cookie session behind.

    Signing in now also sets an HttpOnly session cookie, and this TestClient is
    shared for the whole run — so without clearing it, every later request
    would carry the last login's session. Tests that assert an endpoint refuses
    an unauthenticated caller would silently be authenticated as an admin, and
    a test written for a VIEWER could be answered as somebody else.

    The suite authenticates with the Authorization header, which takes
    precedence over the cookie, so dropping the cookie here keeps "no header
    means anonymous" true. Cookie sessions get their own client and their own
    coverage in test_cookie_session.py.
    """
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    client.cookies.clear()
    return r.json()["token"]


@pytest.fixture
def admin_headers(client):
    return {"Authorization": f"Bearer {_token(client, 'admin@example.com', 'adminpass123')}"}


@pytest.fixture
def super_admin_headers(client):
    from app.auth import hash_password
    from app.database import SessionLocal
    from app.models import User, UserRole

    db = SessionLocal()
    if not db.query(User).filter(User.email == "super@example.com").first():
        db.add(User(
            email="super@example.com", name="Test Super Admin",
            hashed_password=hash_password("superpass123"), role=UserRole.SUPER_ADMIN,
        ))
        db.commit()
    db.close()
    return {"Authorization": f"Bearer {_token(client, 'super@example.com', 'superpass123')}"}
