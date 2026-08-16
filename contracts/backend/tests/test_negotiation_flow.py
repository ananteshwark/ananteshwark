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
