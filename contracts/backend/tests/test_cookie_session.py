"""Cookie sessions: HttpOnly auth, CSRF, and coexistence with bearer tokens.

The session token moved out of localStorage into an HttpOnly cookie, so script
on the page cannot read it. That buys XSS resistance and costs a CSRF exposure
— a cookie is attached by the browser on cross-site requests too — so the two
have to be tested together. Protecting one while opening the other is not a
gain.

Each test drives its own TestClient so it has its own cookie jar. The shared
`client` fixture authenticates by header and clears cookies after signing in
(see conftest), precisely so that model stays intact; these are the tests that
deliberately do the opposite.
"""
import pytest
from fastapi.testclient import TestClient

from app.auth import CSRF_COOKIE, CSRF_HEADER, EXPIRY_COOKIE, SESSION_COOKIE

EMAIL, PASSWORD = "admin@example.com", "adminpass123"


@pytest.fixture
def browser(client):
    """A client with its own cookie jar, signed in like a browser would be."""
    from app.main import app
    c = TestClient(app)
    r = c.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    yield c
    c.close()


class TestTheCookiesThemselves:
    def test_signing_in_sets_all_three(self, browser):
        for name in (SESSION_COOKIE, CSRF_COOKIE, EXPIRY_COOKIE):
            assert name in browser.cookies, f"{name} was not set"

    def test_the_session_cookie_is_httponly_and_the_others_are_not(self, client):
        from app.main import app
        c = TestClient(app)
        r = c.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        raw = r.headers.get_list("set-cookie")
        by_name = {s.split("=", 1)[0]: s.lower() for s in raw}

        # The whole point: script must not be able to read the session.
        assert "httponly" in by_name[SESSION_COOKIE]
        # And must be able to read these two, or the CSRF scheme and the expiry
        # warning cannot work.
        assert "httponly" not in by_name[CSRF_COOKIE]
        assert "httponly" not in by_name[EXPIRY_COOKIE]
        c.close()

    def test_samesite_is_lax_not_strict(self, client):
        """Strict would withhold the cookie on the navigation an identity
        provider redirects the user back on — they would land signed out."""
        from app.main import app
        c = TestClient(app)
        r = c.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        session = [s for s in r.headers.get_list("set-cookie") if s.startswith(SESSION_COOKIE)][0]
        assert "samesite=lax" in session.lower()
        c.close()

    def test_the_expiry_cookie_is_a_plausible_timestamp(self, browser):
        import time
        from app.config import settings
        exp = int(browser.cookies[EXPIRY_COOKIE])
        expected = time.time() + settings.JWT_EXPIRY_MINUTES * 60
        assert abs(exp - expected) < 120, f"{exp} is not about {expected}"


class TestReadingWithTheCookie:
    def test_a_get_works_with_no_authorization_header(self, browser):
        r = browser.get("/api/contracts/validation-queue")
        assert r.status_code == 200, r.text

    def test_it_is_the_right_user(self, browser):
        assert browser.get("/api/auth/me").json()["email"] == EMAIL

    def test_no_cookie_means_no_access(self, browser):
        browser.cookies.clear()
        assert browser.get("/api/contracts/validation-queue").status_code == 401


class TestCsrf:
    def _csrf(self, browser):
        return {CSRF_HEADER: browser.cookies[CSRF_COOKIE]}

    def test_a_write_with_the_token_succeeds(self, browser):
        r = browser.post("/api/authoring/drafts", headers=self._csrf(browser),
                         json={"origin": "scratch", "contract_type": "MSA"})
        assert r.status_code == 200, r.text

    def test_a_write_without_the_token_is_refused(self, browser):
        """The forged-request case. A cross-site page can make the browser send
        the session cookie, but cannot read a cookie to copy into a header."""
        r = browser.post("/api/authoring/drafts",
                         json={"origin": "scratch", "contract_type": "MSA"})
        assert r.status_code == 403, r.text
        assert "csrf" in r.json()["detail"].lower()

    def test_a_write_with_the_wrong_token_is_refused(self, browser):
        r = browser.post("/api/authoring/drafts",
                         headers={CSRF_HEADER: "not-the-value-in-the-cookie"},
                         json={"origin": "scratch", "contract_type": "MSA"})
        assert r.status_code == 403, r.text

    @pytest.mark.parametrize("method,path", [
        ("POST", "/api/authoring/drafts"),
        ("PUT", "/api/settings"),
        ("PATCH", "/api/auth/users/1"),
        ("DELETE", "/api/authoring/drafts/1"),
    ])
    def test_every_unsafe_method_is_covered(self, browser, method, path):
        """POST is not the only way to change something. Real routes on
        purpose: an unrouted method returns 405 before any dependency runs, so
        testing against one would prove nothing about the CSRF gate."""
        r = browser.request(method, path, json={})
        assert r.status_code == 403, f"{method} {path} was not CSRF-checked: {r.status_code}"
        assert "csrf" in r.json().get("detail", "").lower(), r.text

    def test_reads_need_no_token(self, browser):
        """A GET cannot change state, and requiring a token on reads would
        break every plain navigation."""
        assert browser.get("/api/contracts/validation-queue").status_code == 200


class TestBearerStillWorks:
    def test_a_header_session_needs_no_csrf_token(self, client, admin_headers):
        """API tokens and scripts authenticate this way. A cross-site page
        cannot attach an Authorization header, so these are exempt by
        construction rather than by exception — and if they were not exempt,
        every existing client would break."""
        r = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"})
        assert r.status_code == 200, r.text

    def test_the_header_wins_over_the_cookie(self, browser, client):
        """A caller who sends an explicit header is being deliberate. Answering
        as the ambient cookie user instead would authenticate them as somebody
        else entirely."""
        from app.auth import hash_password
        from app.database import SessionLocal
        from app.models import User, UserRole
        db = SessionLocal()
        if not db.query(User).filter(User.email == "cookie-vs-header@example.com").first():
            db.add(User(email="cookie-vs-header@example.com", name="Other",
                        role=UserRole.VIEWER, hashed_password=hash_password("otherpass123")))
            db.commit()
        db.close()

        other = browser.post("/api/auth/login",
                             json={"email": "cookie-vs-header@example.com",
                                   "password": "otherpass123"}).json()["token"]
        # `browser` is signed in as the admin by cookie; the header names the
        # viewer. The header must win.
        me = browser.get("/api/auth/me", headers={"Authorization": f"Bearer {other}"}).json()
        assert me["email"] == "cookie-vs-header@example.com"


class TestLogout:
    def test_it_clears_the_session(self, browser):
        """The cookie is HttpOnly, so the client cannot delete it — signing out
        has to be something the server does."""
        assert browser.post("/api/auth/logout").status_code == 200
        assert browser.get("/api/contracts/validation-queue").status_code == 401

    def test_it_works_without_a_valid_session(self, client):
        """"Get me out" should work even when the session is already broken."""
        from app.main import app
        c = TestClient(app)
        assert c.post("/api/auth/logout").status_code == 200
        c.close()
