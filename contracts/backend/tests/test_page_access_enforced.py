"""Page Access must actually gate the API, not just the navigation.

Before auth.require_page existed, page_access.can_access() had no callers
anywhere in the backend. The admin screen wrote a config that only hid nav
links: an administrator who removed a page from a role saw the link disappear
and reasonably concluded the role could no longer reach it, while every
endpoint behind that page stayed open to anyone who typed the URL.

These tests pin the three properties that make the gate trustworthy:
  1. Removing a page from a role blocks that role's API calls.
  2. Granting a page can never widen access past an endpoint's own role gate.
  3. Callers with no user session (vendor share links, e-sign webhooks) are
     unaffected — they hold no role, so there is nothing to gate.
"""
import pytest

from app.auth import hash_password
from app.database import SessionLocal
from app.models import User, UserRole
from app.services import page_access


@pytest.fixture
def viewer_headers(client):
    db = SessionLocal()
    if not db.query(User).filter(User.email == "pageviewer@example.com").first():
        db.add(User(
            email="pageviewer@example.com", name="Page Viewer",
            hashed_password=hash_password("viewerpass123"), role=UserRole.VIEWER,
        ))
        db.commit()
    db.close()
    r = client.post("/api/auth/login",
                    json={"email": "pageviewer@example.com", "password": "viewerpass123"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
def restore_page_access(client, admin_headers):
    """Put the config back after each test — it is global server state."""
    yield
    db = SessionLocal()
    page_access.set_config(db, {p["key"]: list(page_access.DEFAULT_ACCESS[p["key"]])
                                for p in page_access.PAGES})
    db.commit()
    db.close()
    page_access.invalidate_cache()


def _set_page(key, roles):
    db = SessionLocal()
    cfg = page_access.get_config(db)
    cfg[key] = roles
    page_access.set_config(db, cfg)
    db.commit()
    db.close()


class TestRestricts:
    def test_removing_a_role_blocks_its_api_calls(self, client, viewer_headers,
                                                  restore_page_access):
        # Baseline: "contracts" is open to every role by default.
        assert client.get("/api/contracts", headers=viewer_headers).status_code == 200

        _set_page("contracts", ["ADMIN"])

        r = client.get("/api/contracts", headers=viewer_headers)
        assert r.status_code == 403, r.text
        # The message must name the page: the cause is a config choice an admin
        # can reverse, and a bare "Insufficient permissions" sends people
        # hunting through role assignments that are not the problem.
        assert "contracts" in r.json()["detail"]

    def test_other_pages_are_unaffected(self, client, viewer_headers, restore_page_access):
        _set_page("contracts", ["ADMIN"])
        assert client.get("/api/dashboard", headers=viewer_headers).status_code == 200

    def test_super_admin_is_never_locked_out(self, client, super_admin_headers,
                                             restore_page_access):
        _set_page("contracts", [])
        assert client.get("/api/contracts", headers=super_admin_headers).status_code == 200

    def test_extra_roles_count(self, client, restore_page_access):
        """A user's extra_roles must be honoured. Checking only the primary role
        would deny a VIEWER+ADMIN user pages their ADMIN role grants."""
        db = SessionLocal()
        u = db.query(User).filter(User.email == "extraroles@example.com").first()
        if u is None:
            u = User(email="extraroles@example.com", name="Extra Roles",
                     hashed_password=hash_password("extrapass123"), role=UserRole.VIEWER)
            db.add(u)
        u.extra_roles = ["ADMIN"]
        db.commit(); db.close()
        r = client.post("/api/auth/login",
                        json={"email": "extraroles@example.com", "password": "extrapass123"})
        headers = {"Authorization": f"Bearer {r.json()['token']}"}

        _set_page("contracts", ["ADMIN"])   # granted via extra_roles only
        assert client.get("/api/contracts", headers=headers).status_code == 200


class TestNeverWidens:
    def test_granting_a_page_does_not_bypass_the_endpoint_role_gate(
            self, client, viewer_headers, restore_page_access):
        """The gate is applied *in addition to* each endpoint's role dependency.
        If it replaced it, ticking a box in the page editor would hand a viewer
        the audit log."""
        _set_page("audit", page_access.ROLES)   # every role, including VIEWER

        r = client.get("/api/audit", headers=viewer_headers)
        assert r.status_code == 403, r.text
        # 403 from require_admin, not from require_page — the page is granted.
        assert "page" not in r.json()["detail"].lower()


class TestTokenCallersUnaffected:
    def test_no_session_passes_through_to_the_endpoints_own_check(
            self, client, restore_page_access):
        """Vendor share links and webhooks carry no user. require_page must not
        turn those into 401s before their own token check runs — an earlier
        version of this gate did exactly that and broke every share link."""
        _set_page("contracts", [])   # no role may reach the contracts page

        # An unauthenticated call is still refused by the endpoint itself...
        assert client.get("/api/contracts").status_code == 401
        # ...while a token-authenticated route on the same gated router
        # (contract_action_api is mounted under the "contracts" page) is judged
        # by its own token validation. It may well refuse a bogus token — what
        # matters is that the refusal comes from the token check and not from
        # page access, which has no role to judge here.
        r = client.get("/api/contract-action/not-a-real-token")
        assert r.status_code in (401, 403, 404)
        assert "Page Access" not in r.text


class TestConfiguration:
    def test_every_router_page_key_is_real(self):
        """A typo in ROUTER_PAGES would silently gate a router on a key that is
        not in the catalogue, and get_config() returns [] for an unknown key —
        locking every role out of that router with no way to grant it back."""
        from app.main import ROUTER_PAGES
        known = {p["key"] for p in page_access.PAGES}
        for _router, key in ROUTER_PAGES:
            assert key is None or key in known, f"unknown page key {key!r} in ROUTER_PAGES"

    def test_saving_the_config_invalidates_the_cache(self, client, viewer_headers,
                                                     admin_headers, restore_page_access):
        """The per-request lookup is cached for 30s. Without invalidation on
        write, an admin would save a change and watch it not take effect."""
        assert client.get("/api/contracts", headers=viewer_headers).status_code == 200
        cfg = client.get("/api/settings/page-access", headers=admin_headers).json()["access"]
        cfg["contracts"] = ["ADMIN"]
        assert client.put("/api/settings/page-access", json={"access": cfg},
                          headers=admin_headers).status_code == 200
        # Immediately, not 30 seconds later.
        assert client.get("/api/contracts", headers=viewer_headers).status_code == 403
