"""Who can reach what — one representative endpoint per router, every role.

Permissions here are composed from two independent layers: the endpoint's own
role dependency (require_viewer / require_author / require_admin) and the
admin-configurable Page Access gate applied per router. The effective answer is
the *intersection*, which is narrower than either layer alone and is not
obvious from reading either one — /clauses/ai-status is require_viewer but sits
behind an author-only page, so a VIEWER is refused.

Nothing asserted that composition end to end. A review-thread leak already
shipped from exactly this blind spot: an endpoint that looked correctly gated
in isolation. This table makes the whole authorisation surface visible in one
place, so any change to it shows up as a diff here rather than as a report from
production.

The expectations are written from intent, not read back from the code — a
matrix generated from the current behaviour would assert only that today
equals today.
"""
import pytest

from app.auth import hash_password
from app.database import SessionLocal
from app.models import User, UserRole

SUPER = "SUPER_ADMIN"
ADMIN = "ADMIN"
VALIDATOR = "VALIDATOR"
VIEWER = "VIEWER"
AUTHOR = "AUTHOR"
LEGAL = "LEGAL"
APPROVER = "APPROVER"
REQUESTER = "REQUESTER"

ROLES = [SUPER, ADMIN, VALIDATOR, VIEWER, AUTHOR, LEGAL, APPROVER, REQUESTER]

# Everyone signed in.
ANY_SIGNED_IN = set(ROLES)
# require_author, plus SUPER_ADMIN which supersedes every gate.
AUTHORING = {SUPER, ADMIN, VALIDATOR, AUTHOR, LEGAL, APPROVER}
ADMIN_ONLY = {SUPER, ADMIN}
# Page Access keeps report definitions tighter than the authoring set: they
# shape what leadership sees.
REPORT_BUILDER = {SUPER, ADMIN, VALIDATOR, LEGAL, APPROVER}

# (path, roles that must get through). Everything else must be refused.
MATRIX: list[tuple[str, set[str]]] = [
    # Open to anyone signed in.
    ("/api/contracts/validation-queue", ANY_SIGNED_IN),
    ("/api/vendors", ANY_SIGNED_IN),
    ("/api/departments", ANY_SIGNED_IN),
    ("/api/dashboard/upcoming-milestones", ANY_SIGNED_IN),
    ("/api/duplicates", ANY_SIGNED_IN),
    ("/api/ingestion", ANY_SIGNED_IN),
    ("/api/internal-entities", ANY_SIGNED_IN),
    ("/api/notifications", ANY_SIGNED_IN),
    ("/api/obligations", ANY_SIGNED_IN),
    ("/api/payments", ANY_SIGNED_IN),
    ("/api/portfolio/attributes", ANY_SIGNED_IN),
    ("/api/reports/cycle-time", ANY_SIGNED_IN),
    ("/api/repo-ai/index-status", ANY_SIGNED_IN),
    ("/api/requests", ANY_SIGNED_IN),
    ("/api/rules", ANY_SIGNED_IN),
    ("/api/saved-filters", ANY_SIGNED_IN),
    ("/api/tags", ANY_SIGNED_IN),
    ("/api/tasks", ANY_SIGNED_IN),
    ("/api/custom-fields", ANY_SIGNED_IN),
    ("/api/compliance", ANY_SIGNED_IN),
    ("/api/fx/rates", ANY_SIGNED_IN),

    # Authoring work. Note /clauses and /esign are require_viewer at the
    # endpoint but sit behind author-only pages — the composition is what makes
    # them authoring-only, and it is the whole reason this table exists.
    ("/api/authoring/field-policy", AUTHORING),
    ("/api/clauses/ai-status", AUTHORING),
    ("/api/esign/envelopes", AUTHORING),
    ("/api/ai/runs", AUTHORING),

    ("/api/report-builder/columns", REPORT_BUILDER),

    # Administration.
    ("/api/settings", ADMIN_ONLY),
    ("/api/audit", ADMIN_ONLY),
    ("/api/retention/deleted", ADMIN_ONLY),
    ("/api/api-tokens", ADMIN_ONLY),
]


@pytest.fixture(scope="module")
def role_headers(client):
    """One signed-in user per role."""
    out = {}
    db = SessionLocal()
    for role in ROLES:
        email = f"matrix-{role.lower()}@example.com"
        if not db.query(User).filter(User.email == email).first():
            db.add(User(email=email, name=f"Matrix {role}", role=UserRole(role),
                        hashed_password=hash_password("matrixpass123")))
        out[role] = email
    db.commit()
    db.close()

    headers = {}
    for role, email in out.items():
        r = client.post("/api/auth/login", json={"email": email, "password": "matrixpass123"})
        assert r.status_code == 200, f"{role}: {r.text}"
        headers[role] = {"Authorization": f"Bearer {r.json()['token']}"}
    # Signing in also sets a session cookie, and this client is shared. Left in
    # place it would authenticate the anonymous sweep below as the last role to
    # log in — which is exactly the leak that sweep exists to catch.
    client.cookies.clear()
    return headers


@pytest.mark.parametrize("path,allowed", MATRIX, ids=[m[0] for m in MATRIX])
def test_authorization_matrix(client, role_headers, path, allowed):
    denied_wrongly, allowed_wrongly = [], []
    for role in ROLES:
        status = client.get(path, headers=role_headers[role]).status_code
        # 4xx other than 401/403 (a 404 for an empty collection, a 422) still
        # means the caller got past authorisation.
        got_through = status not in (401, 403)
        if role in allowed and not got_through:
            denied_wrongly.append((role, status))
        if role not in allowed and got_through:
            allowed_wrongly.append((role, status))

    assert not allowed_wrongly, (
        f"{path}: these roles reached it but should not have: {allowed_wrongly}")
    assert not denied_wrongly, (
        f"{path}: these roles were refused but should have reached it: {denied_wrongly}")


def test_every_endpoint_refuses_anonymous(client):
    """No signed-out caller reaches any of them. /auth/* and the token-
    authenticated /v1/* API are deliberately not in the matrix."""
    leaked = [p for p, _ in MATRIX if client.get(p).status_code != 401]
    assert not leaked, f"reachable without authentication: {leaked}"
