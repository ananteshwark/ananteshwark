"""A reviewer with no authoring role must be able to suggest edits.

Reviews can be sent to any user, and the point of suggesting mode is that a
reviewer proposes the actual wording instead of describing it in prose. The
gate on /reviewer-suggest-inline is therefore "were you asked to review this
draft", not "do you hold an authoring role" — but nothing tested that a plain
VIEWER, invited as a reviewer, can actually get through it. The path a
non-authoring reviewer takes was the one path with no coverage.

These also pin the other half: being a VIEWER is not on its own enough. Without
an invitation the endpoint must refuse, or "send to any user" would mean every
user can rewrite every draft.
"""
import pytest

from app.auth import hash_password
from app.database import SessionLocal
from app.models import DraftStatus, User, UserRole


def _make_user(client, email, role, password="reviewpass123"):
    db = SessionLocal()
    if not db.query(User).filter(User.email == email).first():
        db.add(User(email=email, name=email.split("@")[0], role=role,
                    hashed_password=hash_password(password)))
        db.commit()
    uid = db.query(User).filter(User.email == email).first().id
    db.close()
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return uid, {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
def viewer(client):
    return _make_user(client, "rsi-reviewer@example.com", UserRole.VIEWER)


@pytest.fixture
def outsider(client):
    return _make_user(client, "rsi-outsider@example.com", UserRole.VIEWER)


def _draft_with_clause(client, admin_headers):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    client.post(f"/api/authoring/drafts/{d['id']}/insert-clause", headers=admin_headers,
                json={"clause_type": "Indemnity",
                      "text": "The vendor shall indemnify the company fully."})
    return d["id"]


def _edited_document(client, draft_id, headers, new_text):
    doc = client.get(f"/api/authoring/drafts/{draft_id}", headers=headers).json()["document"]
    for block in doc["content"]:
        for node in (block.get("content") or []):
            if node.get("type") == "text" and "indemnify" in node.get("text", ""):
                node["text"] = new_text
    return doc


class TestInvitedReviewerWithNoAuthoringRole:
    def test_viewer_asked_to_review_can_suggest_edits(self, client, admin_headers, viewer):
        uid, headers = viewer
        draft_id = _draft_with_clause(client, admin_headers)
        r = client.post(f"/api/authoring/drafts/{draft_id}/review-requests",
                        headers=admin_headers, json={"reviewer_ids": [uid]})
        assert r.status_code == 200, r.text

        doc = _edited_document(client, draft_id, admin_headers,
                               "The vendor shall indemnify the company only up to fees paid.")
        r = client.post(f"/api/authoring/drafts/{draft_id}/reviewer-suggest-inline",
                        headers=headers, json={"document": doc})
        assert r.status_code == 200, r.text
        assert r.json()["created"] >= 1

    def test_the_suggestion_is_attributed_to_the_reviewer(self, client, admin_headers, viewer):
        """The author has to know whose wording they are accepting."""
        uid, headers = viewer
        draft_id = _draft_with_clause(client, admin_headers)
        client.post(f"/api/authoring/drafts/{draft_id}/review-requests",
                    headers=admin_headers, json={"reviewer_ids": [uid]})
        doc = _edited_document(client, draft_id, admin_headers,
                               "The vendor shall indemnify the company up to the fees paid.")
        client.post(f"/api/authoring/drafts/{draft_id}/reviewer-suggest-inline",
                    headers=headers, json={"document": doc})

        rows = client.get(f"/api/authoring/drafts/{draft_id}/changes",
                          headers=admin_headers).json()
        mine = [c for c in rows if "fees paid" in (c.get("proposed_text") or "")]
        assert mine, rows
        assert mine[0]["author_email"] == "rsi-reviewer@example.com", mine[0]
        assert mine[0]["change_type"] == "REPLACE"
        assert mine[0]["original_text"] == "The vendor shall indemnify the company fully."

    def test_suggesting_on_a_plain_draft_moves_it_into_internal_review(self, client, admin_headers):
        """Suggesting is itself a review, so a draft nobody has formally been
        invited to still leaves DRAFT once someone proposes wording on it.

        Deliberately not driven through an invited reviewer: creating the review
        request already sets INTERNAL_REVIEW, so that route would assert nothing
        about this endpoint. An admin needs no invitation, which leaves the
        draft in DRAFT and makes the transition observable.
        """
        draft_id = _draft_with_clause(client, admin_headers)
        before = client.get(f"/api/authoring/drafts/{draft_id}", headers=admin_headers).json()
        assert before["status"] in (DraftStatus.DRAFT.value, "DRAFT"), before["status"]

        doc = _edited_document(client, draft_id, admin_headers,
                               "The vendor shall indemnify the company for direct losses only.")
        r = client.post(f"/api/authoring/drafts/{draft_id}/reviewer-suggest-inline",
                        headers=admin_headers, json={"document": doc})
        assert r.status_code == 200 and r.json()["created"] >= 1, r.text

        detail = client.get(f"/api/authoring/drafts/{draft_id}", headers=admin_headers).json()
        assert detail["status"] in (DraftStatus.INTERNAL_REVIEW.value, "INTERNAL_REVIEW")


class TestUninvitedUsersAreRefused:
    def test_viewer_without_an_invitation_is_refused(self, client, admin_headers, outsider):
        """Sending reviews to any user must not mean any user may rewrite any
        draft. The invitation is the authorisation."""
        _uid, headers = outsider
        draft_id = _draft_with_clause(client, admin_headers)
        doc = _edited_document(client, draft_id, admin_headers, "Rewritten by a stranger.")
        r = client.post(f"/api/authoring/drafts/{draft_id}/reviewer-suggest-inline",
                        headers=headers, json={"document": doc})
        assert r.status_code == 403, r.text

    def test_anonymous_is_refused(self, client, admin_headers):
        draft_id = _draft_with_clause(client, admin_headers)
        r = client.post(f"/api/authoring/drafts/{draft_id}/reviewer-suggest-inline",
                        json={"document": {"type": "doc", "content": []}})
        assert r.status_code == 401


class TestGuards:
    def test_finalized_draft_rejects_suggestions(self, client, admin_headers, viewer):
        uid, headers = viewer
        draft_id = _draft_with_clause(client, admin_headers)
        client.post(f"/api/authoring/drafts/{draft_id}/review-requests",
                    headers=admin_headers, json={"reviewer_ids": [uid]})

        from app.models import Contract, ContractStatus, ContractDraft, LifecycleStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="V", contract_service="s", raw_extracted={}, confidence={},
                     status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE)
        db.add(c); db.commit()
        db.get(ContractDraft, draft_id).contract_id = c.sr_no
        db.commit(); db.close()

        r = client.post(f"/api/authoring/drafts/{draft_id}/reviewer-suggest-inline",
                        headers=headers, json={"document": {"type": "doc", "content": []}})
        assert r.status_code == 409, r.text

    def test_a_non_document_payload_is_rejected(self, client, admin_headers, viewer):
        uid, headers = viewer
        draft_id = _draft_with_clause(client, admin_headers)
        client.post(f"/api/authoring/drafts/{draft_id}/review-requests",
                    headers=admin_headers, json={"reviewer_ids": [uid]})
        r = client.post(f"/api/authoring/drafts/{draft_id}/reviewer-suggest-inline",
                        headers=headers, json={"document": "not a document"})
        assert r.status_code == 400, r.text
