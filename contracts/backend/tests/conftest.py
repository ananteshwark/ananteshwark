"""Shared pytest fixtures. Sets a temp file DB and disables background services
before any app module is imported, so the API integration tests exercise the
real app (routers, auth, DB) against an isolated database."""
import os
import pathlib
import tempfile

# Must be set before app.config / app.database are imported anywhere.
os.environ["CMS_BACKGROUND_SERVICES"] = "false"
os.environ.setdefault("JWT_SECRET", "test-secret-key-at-least-32-bytes-long-000000")
_DB = pathlib.Path(tempfile.gettempdir()) / "cms_pytest.db"
_DB.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{_DB}"

import pytest
from fastapi.testclient import TestClient


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
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
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
