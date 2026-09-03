"""Negotiation → acceptance → signature → renewal flow, and document import."""


def _signers():
    return {"signers": [
        {"name": "Company Rep", "email": "rep@ikshealth.com", "role": "Signer", "order": 1},
        {"name": "Vendor Rep", "email": "rep@vendor.com", "role": "Signer", "order": 2},
    ]}


def _share(client, headers, access="SUGGEST"):
    d = client.post("/api/authoring/drafts", headers=headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    client.post(f"/api/authoring/drafts/{d['id']}/insert-clause", headers=headers,
                json={"clause_type": "Indemnity", "text": "The vendor shall indemnify the company fully."})
    link = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=headers,
                       json={"recipients": [{"email": "v@x.com"}], "access": access}).json()["links"][0]
    return d, link


class TestAcceptedChangeReflects:
    def test_accepted_change_updates_document_and_vendor_view(self, client, admin_headers):
        d, link = _share(client, admin_headers)
        detail = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
        doc = detail["document"]
        # Vendor edits the indemnity clause inline.
        for b in doc["content"]:
            for t in (b.get("content") or []):
                if t.get("type") == "text" and "indemnify" in t.get("text", ""):
                    t["text"] = "The vendor shall indemnify the company only up to fees paid."
        r = client.post(f"/api/vendor/{link['token']}/suggest-inline", json={"document": doc})
        assert r.status_code == 200 and r.json()["created"] >= 1

        # Author accepts the change.
        changes = client.get(f"/api/authoring/drafts/{d['id']}/changes", headers=admin_headers).json()
        cid = changes[0]["id"]
        dec = client.post(f"/api/authoring/changes/{cid}/decide", headers=admin_headers,
                          json={"decision": "ACCEPTED"})
        assert dec.status_code == 200, dec.text

        # The accepted text is now in the draft document …
        after = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
        blob = str(after["document"])
        assert "up to fees paid" in blob
        # … and the vendor sees the updated version too.
        vview = client.get(f"/api/vendor/{link['token']}").json()
        assert "up to fees paid" in str(vview["document"])


class TestVendorAcceptGate:
    def test_send_blocked_until_vendor_accepts(self, client, admin_headers):
        d, link = _share(client, admin_headers)
        # Shared but not accepted → send is blocked.
        blocked = client.post(f"/api/esign/drafts/{d['id']}/send", headers=admin_headers, json=_signers())
        assert blocked.status_code == 403
        assert "accept" in blocked.json()["detail"].lower()

        # Vendor accepts the version.
        acc = client.post(f"/api/vendor/{link['token']}/accept")
        assert acc.status_code == 200 and acc.json()["vendor_accepted"] is True
        assert client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()["vendor_accepted_at"]

        # Now sending succeeds.
        ok = client.post(f"/api/esign/drafts/{d['id']}/send", headers=admin_headers, json=_signers())
        assert ok.status_code == 200, ok.text

    def test_resharing_clears_prior_acceptance(self, client, admin_headers):
        d, link = _share(client, admin_headers)
        client.post(f"/api/vendor/{link['token']}/accept")
        # Re-share a new round → acceptance is cleared.
        client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers,
                    json={"recipients": [{"email": "v2@x.com"}], "access": "SUGGEST"})
        assert client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()["vendor_accepted_at"] is None


class TestRenewalExecution:
    def test_signed_renewal_marks_source_renewed(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, LifecycleStatus
        db = SessionLocal()
        src = Contract(vendor_name_raw="RenewCo", contract_service="svc",
                       status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
                       start_date=None, raw_extracted={}, confidence={})
        db.add(src); db.commit(); sr = src.sr_no; db.close()

        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "duplicate", "source_contract_id": sr, "link_as": "renewal"}).json()
        # Not shared with a vendor → send is allowed straight away.
        env = client.post(f"/api/esign/drafts/{d['id']}/send", headers=admin_headers, json=_signers()).json()
        done = client.post("/api/esign/webhook",
                           json={"envelope_id": env["external_id"], "status": "completed"})
        assert done.status_code == 200

        db = SessionLocal()
        src2 = db.get(Contract, sr)
        lc = src2.lifecycle_status.value
        db.close()
        assert lc == "RENEWED"

        # The new signed contract is validated.
        detail = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
        contract = client.get(f"/api/contracts/{detail['contract_id']}", headers=admin_headers).json()
        assert contract["status"] == "VALIDATED"
        assert contract["renews_contract_id"] == sr


class TestImportDraft:
    def test_import_docx_creates_draft(self, client, admin_headers):
        from app.services.docx import document_to_docx
        doc = {"type": "doc", "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "AGREEMENT"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "This is the imported body clause text."}]},
        ]}
        data = document_to_docx("Imported", doc, {})
        files = {"file": ("contract.docx", data,
                          "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
        r = client.post("/api/authoring/drafts/import", headers=admin_headers, files=files,
                        params={"contract_type": "MSA"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["origin"] == "import"
        assert body["contract_type"] == "MSA"
        assert "imported body clause text" in str(body["document"])

    def test_import_rejects_unsupported(self, client, admin_headers):
        files = {"file": ("notes.txt", b"hello", "text/plain")}
        r = client.post("/api/authoring/drafts/import", headers=admin_headers, files=files)
        assert r.status_code == 415  # Unsupported Media Type


class TestInternalReviewGate:
    def test_review_is_advisory_share_not_blocked(self, client, admin_headers):
        """Internal review never blocks the author from sending to the vendor,
        even with the (legacy) setting on and reviews still outstanding."""
        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"require_internal_review_before_share": "true"}})
        try:
            d = client.post("/api/authoring/drafts", headers=admin_headers,
                            json={"origin": "scratch", "contract_type": "MSA"}).json()
            # Request review from an eligible reviewer (admin qualifies).
            reviewers = client.get("/api/authoring/reviewers", headers=admin_headers).json()
            reviewers = [r for r in reviewers if r["email"] == "admin@example.com"] or reviewers
            assert reviewers, "admin should be an eligible reviewer"
            rr = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                             json={"reviewer_ids": [reviewers[0]["id"]],
                                   "excerpt": "Section 3 — Indemnity", "note": "please check the cap"})
            assert rr.status_code == 200, rr.text
            assert rr.json()["summary"]["pending"] == 1
            # Author can still share while the review is pending — no 403.
            ok = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers,
                             json={"recipients": [{"email": "v@x.com"}], "access": "SUGGEST"})
            assert ok.status_code == 200, ok.text
        finally:
            client.put("/api/settings", headers=admin_headers,
                       json={"values": {"require_internal_review_before_share": "false"}})

    def test_reviewer_completes_section_review(self, client, admin_headers):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        reviewers = client.get("/api/authoring/reviewers", headers=admin_headers).json()
        reviewers = [r for r in reviewers if r["email"] == "admin@example.com"] or reviewers
        rr = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                         json={"reviewer_ids": [reviewers[0]["id"]], "excerpt": "Payment terms"}).json()
        req_id = rr["requests"][0]["id"]
        done = client.post(f"/api/authoring/review-requests/{req_id}/complete", headers=admin_headers,
                           json={"outcome": "changes_requested", "comment": "net-30 not net-60"})
        assert done.status_code == 200, done.text
        assert done.json()["status"] == "reviewed" and done.json()["outcome"] == "changes_requested"
        after = client.get(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers).json()
        assert after["summary"]["pending"] == 0 and after["summary"]["reviewed"] == 1

    def test_review_request_emails_reviewer(self, client, admin_headers, monkeypatch):
        """Requesting a review sends the reviewer an email (same SMTP path as the
        working test mail), not just an in-app notification."""
        sent = []
        from app.services import notifications as N

        class _Cap:
            def send(self, to, subject, body, cc=None):
                sent.append((to, subject))
        monkeypatch.setitem(N.CHANNELS, "email", _Cap())

        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        reviewers = client.get("/api/authoring/reviewers", headers=admin_headers).json()
        reviewers = [r for r in reviewers if r["email"] == "admin@example.com"] or reviewers
        r = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                        json={"reviewer_ids": [reviewers[0]["id"]], "excerpt": "Indemnity"})
        assert r.status_code == 200, r.text
        assert sent, "no review email was sent"
        to, subject = sent[0]
        assert reviewers[0]["email"] in to
        assert "Review requested" in subject


class TestReviewLinksLandOnTheReviewsPage:
    """The review emails and notifications used to point at the authoring
    workspace. Everything a review needs — replying, suggesting, approving,
    accepting — is on the Reviews page, and a reviewer dropped into the full
    editor had no indication of what they had been asked to look at."""

    def _capture(self, monkeypatch):
        sent = []
        from app.services import notifications as N

        class _Cap:
            def send(self, to, subject, body, cc=None):
                sent.append((to, subject, body))
        monkeypatch.setitem(N.CHANNELS, "email", _Cap())
        return sent

    def _request_review(self, client, admin_headers):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        reviewers = client.get("/api/authoring/reviewers", headers=admin_headers).json()
        reviewers = [r for r in reviewers if r["email"] == "admin@example.com"] or reviewers
        rr = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                         json={"reviewer_ids": [reviewers[0]["id"]], "excerpt": "Indemnity"}).json()
        return d, rr["requests"][0]["id"]

    def test_the_request_email_links_to_the_reviewers_own_thread(self, client, admin_headers, monkeypatch):
        sent = self._capture(monkeypatch)
        _d, req_id = self._request_review(client, admin_headers)
        body = sent[0][2]
        assert f"/reviews?request={req_id}" in body
        assert "/authoring/drafts/" not in body

    def test_the_request_notification_links_to_the_reviews_page(self, client, admin_headers):
        _d, req_id = self._request_review(client, admin_headers)
        rows = client.get("/api/notifications", headers=admin_headers).json()
        mine = [n for n in rows if n["type"] == "review_request"]
        assert mine, "no review_request notification was created"
        assert mine[0]["link"] == f"/reviews?request={req_id}"

    def test_the_completion_email_takes_the_author_to_the_review(self, client, admin_headers, monkeypatch):
        """The author's next step — accept, reject, resolve — is on the Reviews
        page too."""
        _d, req_id = self._request_review(client, admin_headers)
        sent = self._capture(monkeypatch)
        done = client.post(f"/api/authoring/review-requests/{req_id}/complete", headers=admin_headers,
                           json={"outcome": "changes_requested", "comment": "net-30 not net-60"})
        assert done.status_code == 200, done.text
        assert sent, "no completion email was sent"
        body = sent[0][2]
        assert f"/reviews?request={req_id}" in body
        assert "/authoring/drafts/" not in body

    def test_each_reviewer_gets_their_own_thread(self, client, admin_headers, monkeypatch):
        """Two reviewers on one draft are two separate threads; sending both the
        same link would put one reviewer on the other's review."""
        client.post("/api/auth/users", headers=admin_headers, json={
            "email": "legal-rev@example.com", "name": "Legal Rev",
            "password": "password123", "roles": ["LEGAL"]})
        reviewers = client.get("/api/authoring/reviewers", headers=admin_headers).json()
        ids = [r["id"] for r in reviewers][:2]
        assert len(ids) == 2, "need two eligible reviewers"

        sent = self._capture(monkeypatch)
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        rr = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                         json={"reviewer_ids": ids, "excerpt": "Liability"}).json()
        req_ids = sorted(r["id"] for r in rr["requests"])
        assert len(sent) == 2
        linked = sorted(int(b.split("/reviews?request=")[1].split('"')[0]) for _to, _s, b in sent)
        assert linked == req_ids


class TestVersionCompare:
    def test_compare_version_to_current(self, client, admin_headers):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        client.post(f"/api/authoring/drafts/{d['id']}/insert-clause", headers=admin_headers,
                    json={"clause_type": "Indemnity", "text": "Distinctive indemnity wording XYZ."})
        r = client.get(f"/api/authoring/drafts/{d['id']}/compare?base=1&target=0", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["target"] == "current"
        assert body["changed"] >= 1
        assert any("XYZ" in (row.get("b") or "") for row in body["rows"])


class TestReviewSuggestions:
    def _draft_with_text(self, client, admin_headers, text):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        # Put a known paragraph into the document so a suggestion can replace it.
        doc = {"type": "doc", "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": text}]}]}
        client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers,
                   json={"document": doc, "rev": d["rev"]})
        return d

    def test_suggest_then_author_accepts_applies_to_doc(self, client, admin_headers):
        d = self._draft_with_text(client, admin_headers, "The term is net-60 days.")
        reviewers = client.get("/api/authoring/reviewers", headers=admin_headers).json()
        reviewers = [r for r in reviewers if r["email"] == "admin@example.com"] or reviewers
        rr = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                         json={"reviewer_ids": [reviewers[0]["id"]], "excerpt": "The term is net-60 days."}).json()
        rid = rr["requests"][0]["id"]
        # Reviewer suggests a revision.
        client.post(f"/api/authoring/review-requests/{rid}/complete", headers=admin_headers,
                    json={"outcome": "changes_requested", "comment": "shorten it",
                          "suggested_text": "The term is net-30 days."})
        # It shows up in my-reviews.
        mine = client.get("/api/authoring/my-reviews", headers=admin_headers).json()
        assert any(r["id"] == rid and r["suggested_text"] for r in mine["as_reviewer"])
        # Author accepts -> applied to the document.
        acc = client.post(f"/api/authoring/review-requests/{rid}/accept", headers=admin_headers)
        assert acc.status_code == 200, acc.text
        assert acc.json()["applied_to_document"] is True
        assert acc.json()["resolution"] == "accepted"
        detail = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
        flat = str(detail["document"])
        assert "net-30" in flat and "net-60" not in flat

    def test_author_rejects_leaves_doc_unchanged(self, client, admin_headers):
        d = self._draft_with_text(client, admin_headers, "Governing law is Delaware.")
        reviewers = client.get("/api/authoring/reviewers", headers=admin_headers).json()
        reviewers = [r for r in reviewers if r["email"] == "admin@example.com"] or reviewers
        rr = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                         json={"reviewer_ids": [reviewers[0]["id"]], "excerpt": "Governing law is Delaware."}).json()
        rid = rr["requests"][0]["id"]
        client.post(f"/api/authoring/review-requests/{rid}/complete", headers=admin_headers,
                    json={"outcome": "changes_requested", "suggested_text": "Governing law is New York."})
        rej = client.post(f"/api/authoring/review-requests/{rid}/reject", headers=admin_headers)
        assert rej.status_code == 200 and rej.json()["resolution"] == "rejected"
        detail = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
        assert "Delaware" in str(detail["document"])


class TestReviewThread:
    def test_reply_thread_and_resolve(self, client, admin_headers):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        reviewers = client.get("/api/authoring/reviewers", headers=admin_headers).json()
        reviewers = [r for r in reviewers if r["email"] == "admin@example.com"] or reviewers
        rr = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                         json={"reviewer_ids": [reviewers[0]["id"]], "excerpt": "Clause 4", "note": "check this"}).json()
        rid = rr["requests"][0]["id"]
        # A reply is added to the thread.
        r = client.post(f"/api/authoring/review-requests/{rid}/messages", headers=admin_headers,
                        json={"body": "Looks fine to me"})
        assert r.status_code == 200, r.text
        msgs = r.json()["messages"]
        assert msgs and msgs[-1]["body"] == "Looks fine to me"
        # Author resolves the thread.
        res = client.post(f"/api/authoring/review-requests/{rid}/resolve", headers=admin_headers)
        assert res.status_code == 200 and res.json()["resolution"] == "resolved"
        # Empty reply is rejected.
        assert client.post(f"/api/authoring/review-requests/{rid}/messages", headers=admin_headers,
                           json={"body": "  "}).status_code == 400


class TestReviewerInlineSuggest:
    def test_reviewer_inline_edit_becomes_change_and_merges(self, client, admin_headers):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        doc = {"type": "doc", "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "Payment is due in 60 days."}]}]}
        client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers,
                   json={"document": doc, "rev": d["rev"]})
        # Reviewer submits a whole-document edit (net-60 -> net-30).
        edited = {"type": "doc", "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "Payment is due in 30 days."}]}]}
        r = client.post(f"/api/authoring/drafts/{d['id']}/reviewer-suggest-inline", headers=admin_headers,
                        json={"document": edited})
        assert r.status_code == 200, r.text
        assert r.json()["created"] >= 1
        # It appears in the author's changes list as a tracked change.
        changes = client.get(f"/api/authoring/drafts/{d['id']}/changes", headers=admin_headers).json()
        cid = changes[0]["id"]
        # Author accepts -> merged into the document.
        dec = client.post(f"/api/authoring/changes/{cid}/decide", headers=admin_headers,
                          json={"decision": "ACCEPTED"})
        assert dec.status_code == 200, dec.text
        after = client.get(f"/api/authoring/drafts/{d['id']}", headers=admin_headers).json()
        assert "30 days" in str(after["document"]) and "60 days" not in str(after["document"])


class TestReviewersCanBeAnyone:
    """Reviewer eligibility was a fixed role set matched against the user's
    PRIMARY role. Most installs have exactly one person whose primary role is
    Legal/Approver/Admin, so the picker offered one name — which is why a draft
    could not be sent to more than one reviewer."""

    def _user(self, client, admin_headers, email, role):
        client.post("/api/auth/users", headers=admin_headers, json={
            "email": email, "name": email.split("@")[0].title(),
            "password": "password123", "roles": [role]})
        tok = client.post("/api/auth/login",
                          json={"email": email, "password": "password123"}).json()["token"]
        users = client.get("/api/auth/users-lite", headers=admin_headers).json()
        uid = next(u["id"] for u in users if u["email"] == email)
        return uid, {"Authorization": f"Bearer {tok}"}

    def _draft(self, client, admin_headers):
        return client.post("/api/authoring/drafts", headers=admin_headers,
                           json={"origin": "scratch", "contract_type": "MSA"}).json()

    def test_a_plain_viewer_is_offered_as_a_reviewer(self, client, admin_headers):
        uid, _h = self._user(client, admin_headers, "plain-viewer@example.com", "VIEWER")
        rows = client.get("/api/authoring/reviewers", headers=admin_headers).json()
        assert any(r["id"] == uid for r in rows), "a viewer should be pickable as a reviewer"

    def test_a_requester_is_offered_as_a_reviewer(self, client, admin_headers):
        uid, _h = self._user(client, admin_headers, "req-rev@example.com", "REQUESTER")
        rows = client.get("/api/authoring/reviewers", headers=admin_headers).json()
        assert any(r["id"] == uid for r in rows)

    def test_several_reviewers_on_one_draft(self, client, admin_headers):
        a, _ = self._user(client, admin_headers, "rev-a@example.com", "VIEWER")
        b, _ = self._user(client, admin_headers, "rev-b@example.com", "REQUESTER")
        c, _ = self._user(client, admin_headers, "rev-c@example.com", "AUTHOR")
        d = self._draft(client, admin_headers)
        r = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                        json={"reviewer_ids": [a, b, c], "excerpt": "Liability"})
        assert r.status_code == 200, r.text
        assert r.json()["summary"]["total"] == 3

    def test_a_draft_can_be_sent_for_review_more_than_once(self, client, admin_headers):
        a, _ = self._user(client, admin_headers, "round-a@example.com", "VIEWER")
        b, _ = self._user(client, admin_headers, "round-b@example.com", "VIEWER")
        d = self._draft(client, admin_headers)
        first = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                            json={"reviewer_ids": [a], "excerpt": "Indemnity"})
        assert first.status_code == 200, first.text
        second = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                             json={"reviewer_ids": [b], "excerpt": "Payment"})
        assert second.status_code == 200, second.text
        assert second.json()["summary"]["total"] == 2

    def test_a_viewer_reviewer_can_open_and_answer_their_review(self, client, admin_headers):
        """The review endpoints all required an authoring role, so a reviewer
        without one got 403 and could neither see nor answer the request."""
        uid, h = self._user(client, admin_headers, "answering@example.com", "VIEWER")
        d = self._draft(client, admin_headers)
        rr = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                         json={"reviewer_ids": [uid], "excerpt": "Payment terms"}).json()
        req_id = rr["requests"][0]["id"]

        mine = client.get("/api/authoring/my-reviews", headers=h)
        assert mine.status_code == 200, mine.text
        assert [r["id"] for r in mine.json()["as_reviewer"]] == [req_id]

        done = client.post(f"/api/authoring/review-requests/{req_id}/complete", headers=h,
                           json={"outcome": "changes_requested",
                                 "comment": "net-30 please",
                                 "suggested_text": "within thirty (30) days"})
        assert done.status_code == 200, done.text
        assert done.json()["suggested_text"] == "within thirty (30) days"

        reply = client.post(f"/api/authoring/review-requests/{req_id}/messages", headers=h,
                            json={"body": "adding a thought"})
        assert reply.status_code == 200, reply.text

    def test_a_reviewer_can_suggest_edits_on_the_whole_document(self, client, admin_headers):
        uid, h = self._user(client, admin_headers, "inline-rev@example.com", "VIEWER")
        d = self._draft(client, admin_headers)
        client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers, json={"document": {
            "type": "doc", "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "The original wording here."}]}]}})
        client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                    json={"reviewer_ids": [uid]})
        out = client.post(f"/api/authoring/drafts/{d['id']}/reviewer-suggest-inline", headers=h,
                          json={"document": {"type": "doc", "content": [
                              {"type": "paragraph",
                               "content": [{"type": "text", "text": "The revised wording here."}]}]}})
        assert out.status_code == 200, out.text
        assert out.json()["created"] >= 1

    def test_someone_not_asked_to_review_cannot_suggest_inline(self, client, admin_headers):
        _uid, h = self._user(client, admin_headers, "stranger@example.com", "VIEWER")
        d = self._draft(client, admin_headers)
        out = client.post(f"/api/authoring/drafts/{d['id']}/reviewer-suggest-inline", headers=h,
                          json={"document": {"type": "doc", "content": []}})
        assert out.status_code == 403

    def test_only_the_requesting_author_can_cancel(self, client, admin_headers):
        uid, h = self._user(client, admin_headers, "cancel-rev@example.com", "VIEWER")
        d = self._draft(client, admin_headers)
        rr = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=admin_headers,
                         json={"reviewer_ids": [uid]}).json()
        req_id = rr["requests"][0]["id"]
        assert client.delete(f"/api/authoring/review-requests/{req_id}", headers=h).status_code == 403
        assert client.delete(f"/api/authoring/review-requests/{req_id}",
                             headers=admin_headers).status_code == 200


class TestReviewsAreOnlyVisibleToTheirParticipants:
    """A review is a conversation between the person who asked for it and the
    person asked. The draft's review panel listed every thread on a draft to
    anyone holding an authoring role — the private note to the reviewer, their
    comment back, and the whole reply thread."""

    def _user(self, client, admin_headers, email, role):
        client.post("/api/auth/users", headers=admin_headers, json={
            "email": email, "name": email.split("@")[0].title(),
            "password": "password123", "roles": [role]})
        tok = client.post("/api/auth/login",
                          json={"email": email, "password": "password123"}).json()["token"]
        uid = next(u["id"] for u in client.get("/api/auth/users-lite", headers=admin_headers).json()
                   if u["email"] == email)
        return uid, {"Authorization": f"Bearer {tok}"}

    def _seed(self, client, admin_headers, prefix):
        """A draft with one review, requested by an author, assigned to someone
        else, plus an uninvolved third author."""
        author_id, author_h = self._user(client, admin_headers, f"{prefix}-author@example.com", "AUTHOR")
        rev_id, rev_h = self._user(client, admin_headers, f"{prefix}-reviewer@example.com", "VIEWER")
        out_id, out_h = self._user(client, admin_headers, f"{prefix}-outsider@example.com", "AUTHOR")
        d = client.post("/api/authoring/drafts", headers=author_h,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        rr = client.post(f"/api/authoring/drafts/{d['id']}/review-requests", headers=author_h,
                         json={"reviewer_ids": [rev_id],
                               "excerpt": "Confidential liability wording",
                               "note": "private note to the reviewer"}).json()
        return d, rr["requests"][0]["id"], (author_h, rev_h, out_h), (author_id, rev_id, out_id)

    def test_an_uninvolved_author_sees_no_threads_on_the_draft(self, client, admin_headers):
        d, _req, (_a, _r, out_h), _ids = self._seed(client, admin_headers, "vis1")
        panel = client.get(f"/api/authoring/drafts/{d['id']}/review-requests", headers=out_h)
        assert panel.status_code == 200, panel.text
        assert panel.json()["requests"] == []
        assert panel.json()["summary"] == {"total": 0, "pending": 0, "reviewed": 0}

    def test_the_private_note_and_thread_do_not_leak(self, client, admin_headers):
        d, req_id, (_a, rev_h, out_h), _ids = self._seed(client, admin_headers, "vis2")
        client.post(f"/api/authoring/review-requests/{req_id}/messages", headers=rev_h,
                    json={"body": "a private thread reply"})
        body = client.get(f"/api/authoring/drafts/{d['id']}/review-requests", headers=out_h).text
        assert "private note to the reviewer" not in body
        assert "a private thread reply" not in body
        assert "Confidential liability wording" not in body

    def test_the_requesting_author_still_sees_their_own(self, client, admin_headers):
        d, req_id, (author_h, _r, _o), _ids = self._seed(client, admin_headers, "vis3")
        panel = client.get(f"/api/authoring/drafts/{d['id']}/review-requests", headers=author_h).json()
        assert [r["id"] for r in panel["requests"]] == [req_id]
        assert panel["summary"]["pending"] == 1

    def test_the_assigned_reviewer_still_sees_their_own(self, client, admin_headers):
        d, req_id, (_a, rev_h, _o), _ids = self._seed(client, admin_headers, "vis4")
        panel = client.get(f"/api/authoring/drafts/{d['id']}/review-requests", headers=rev_h).json()
        assert [r["id"] for r in panel["requests"]] == [req_id]

    def test_one_author_does_not_see_another_authors_thread_on_a_shared_draft(self, client, admin_headers):
        """Two authors each request a review on the same draft: each sees only
        the one they asked for."""
        _d, req_a, (author_h, _r, other_h), _ids = self._seed(client, admin_headers, "vis5")
        d_id = _d["id"]
        rev2, _rev2_h = self._user(client, admin_headers, "vis5-reviewer2@example.com", "VIEWER")
        second = client.post(f"/api/authoring/drafts/{d_id}/review-requests", headers=other_h,
                             json={"reviewer_ids": [rev2], "excerpt": "Payment terms"})
        assert second.status_code == 200, second.text
        req_b = second.json()["requests"][0]["id"]
        assert req_a != req_b

        mine = client.get(f"/api/authoring/drafts/{d_id}/review-requests", headers=author_h).json()
        theirs = client.get(f"/api/authoring/drafts/{d_id}/review-requests", headers=other_h).json()
        assert [r["id"] for r in mine["requests"]] == [req_a]
        assert [r["id"] for r in theirs["requests"]] == [req_b]

    def test_an_admin_still_sees_every_thread(self, client, admin_headers):
        """Admins can already act on any review; being able to act on something
        you cannot see would be worse than seeing it."""
        d, req_id, _hs, _ids = self._seed(client, admin_headers, "vis6")
        panel = client.get(f"/api/authoring/drafts/{d['id']}/review-requests",
                           headers=admin_headers).json()
        assert req_id in [r["id"] for r in panel["requests"]]

    def test_the_reviews_page_is_already_scoped(self, client, admin_headers):
        _d, _req, (_a, _r, out_h), _ids = self._seed(client, admin_headers, "vis7")
        mine = client.get("/api/authoring/my-reviews", headers=out_h).json()
        assert mine["as_reviewer"] == [] and mine["as_author"] == []
