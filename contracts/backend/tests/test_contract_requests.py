"""Contract request intake: submit, triage, convert to a draft."""


def _viewer(client, admin_headers):
    """Create a plain viewer + return their auth header."""
    client.post("/api/auth/users", headers=admin_headers, json={
        "email": "requester@example.com", "name": "Reqr", "password": "password123",
        "roles": ["VIEWER"],
    })
    tok = client.post("/api/auth/login", json={"email": "requester@example.com",
                                               "password": "password123"}).json()["token"]
    return {"Authorization": f"Bearer {tok}"}


def test_submit_and_triage_and_convert(client, admin_headers):
    h = _viewer(client, admin_headers)
    # A plain viewer can submit a request.
    r = client.post("/api/requests", headers=h, json={
        "title": "NDA with Globex", "counterparty_name": "Globex",
        "contract_type": "NDA", "estimated_value": 0, "priority": "high",
        "description": "Standard mutual NDA",
    })
    assert r.status_code == 200, r.text
    rid = r.json()["id"]
    assert r.json()["status"] == "SUBMITTED"

    # The requester sees only their own.
    mine = client.get("/api/requests", headers=h).json()
    assert [x["id"] for x in mine["requests"]] == [rid]
    assert mine["can_triage"] is False

    # Admin (triager) sees it and can convert it into a draft.
    allr = client.get("/api/requests", headers=admin_headers).json()
    assert any(x["id"] == rid for x in allr["requests"]) and allr["can_triage"] is True

    conv = client.post(f"/api/requests/{rid}/convert", headers=admin_headers)
    assert conv.status_code == 200, conv.text
    draft_id = conv.json()["draft_id"]
    assert conv.json()["request"]["status"] == "CONVERTED"

    # The draft exists and is pre-filled from the request.
    d = client.get(f"/api/authoring/drafts/{draft_id}", headers=admin_headers).json()
    assert d["contract_type"] == "NDA"
    assert d["fields"].get("vendor") == "Globex"
    assert d["origin"] == "request"

    # Re-converting is blocked.
    assert client.post(f"/api/requests/{rid}/convert", headers=admin_headers).status_code == 409


def test_requester_cannot_triage(client, admin_headers):
    h = _viewer(client, admin_headers)
    r = client.post("/api/requests", headers=h, json={"title": "Some request"}).json()
    # A viewer cannot convert or patch.
    assert client.post(f"/api/requests/{r['id']}/convert", headers=h).status_code == 403
    assert client.patch(f"/api/requests/{r['id']}", headers=h, json={"status": "REJECTED"}).status_code == 403


def test_reject_request(client, admin_headers):
    h = _viewer(client, admin_headers)
    r = client.post("/api/requests", headers=h, json={"title": "To reject"}).json()
    dec = client.patch(f"/api/requests/{r['id']}", headers=admin_headers,
                       json={"status": "REJECTED", "decision_reason": "duplicate of existing MSA"})
    assert dec.status_code == 200 and dec.json()["status"] == "REJECTED"
    assert dec.json()["decision_reason"] == "duplicate of existing MSA"


class TestConvertOffersEveryStartingPoint:
    """Converting a request silently picked a template matching the contract
    type. The author never chose, and could not start from the counterparty's
    paper or from last year's contract without abandoning the request."""

    def _request(self, client, headers, **over):
        body = {"title": "Radiology reporting", "contract_type": "MSA",
                "counterparty_name": "Acme Radiology LLP", "currency": "INR",
                "estimated_value": 250000, **over}
        r = client.post("/api/requests", headers=headers, json=body)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_default_still_picks_a_template(self, client, admin_headers):
        rid = self._request(client, admin_headers)
        out = client.post(f"/api/requests/{rid}/convert", headers=admin_headers)
        assert out.status_code == 200, out.text
        assert out.json()["draft_id"]

    def test_scratch_is_honoured(self, client, admin_headers):
        rid = self._request(client, admin_headers)
        out = client.post(f"/api/requests/{rid}/convert?origin=scratch", headers=admin_headers)
        assert out.status_code == 200, out.text
        draft = client.get(f"/api/authoring/drafts/{out.json()['draft_id']}", headers=admin_headers).json()
        assert draft["template_id"] is None, "scratch must not quietly use a template"
        # The requester's answers still pre-fill the draft.
        assert draft["fields"].get("vendor") == "Acme Radiology LLP"
        assert draft["fields"].get("currency") == "INR"

    def test_duplicate_needs_a_source_and_uses_it(self, client, admin_headers):
        import uuid

        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw=f"Src-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                     status=ContractStatus.VALIDATED, payment_term="Net 45 days",
                     extracted_text="1. Services. The Vendor shall provide reporting services.",
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); src = c.sr_no; db.close()

        rid = self._request(client, admin_headers)
        bad = client.post(f"/api/requests/{rid}/convert?origin=duplicate", headers=admin_headers)
        assert bad.status_code == 400, "duplicating without a source should be refused"

        out = client.post(f"/api/requests/{rid}/convert?origin=duplicate&source_contract_id={src}",
                          headers=admin_headers)
        assert out.status_code == 200, out.text
        draft = client.get(f"/api/authoring/drafts/{out.json()['draft_id']}", headers=admin_headers).json()
        assert draft["fields"].get("payment_term") == "Net 45 days", "the source's terms should carry"

    def test_unknown_origin_is_refused(self, client, admin_headers):
        rid = self._request(client, admin_headers)
        r = client.post(f"/api/requests/{rid}/convert?origin=teleport", headers=admin_headers)
        assert r.status_code == 400

    def test_an_imported_document_can_be_attached_to_the_request(self, client, admin_headers):
        """Starting from an upload needs a file, so the draft is created first
        and then linked — otherwise the request sits in the queue next to the
        draft it produced."""
        rid = self._request(client, admin_headers)
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        out = client.post(f"/api/requests/{rid}/link-draft?draft_id={d['id']}", headers=admin_headers)
        assert out.status_code == 200, out.text
        req = client.get("/api/requests", headers=admin_headers).json()
        mine = next(r for r in req["requests"] if r["id"] == rid)
        assert mine["status"] == "CONVERTED" and mine["draft_id"] == d["id"]

    def test_a_request_is_not_converted_twice(self, client, admin_headers):
        rid = self._request(client, admin_headers)
        client.post(f"/api/requests/{rid}/convert?origin=scratch", headers=admin_headers)
        again = client.post(f"/api/requests/{rid}/convert?origin=scratch", headers=admin_headers)
        assert again.status_code == 409


class TestIntakeFields:
    """What the requester already knows, asked once on the request rather than
    chased during triage and re-keyed into the draft."""

    def _submit(self, client, headers, **over):
        body = {"title": "Radiology reporting", "contract_type": "MSA",
                "counterparty_name": "Acme Radiology LLP", **over}
        r = client.post("/api/requests", headers=headers, json=body)
        assert r.status_code == 200, r.text
        return r.json()

    def test_every_field_round_trips(self, client, admin_headers):
        out = self._submit(client, admin_headers,
                           internal_entity="IKS Health Solutions Private Limited",
                           purpose="Outsourced night-time reporting cover",
                           counterparty_address="12 Marine Drive\nMumbai 400020",
                           phi_shared=True, spoc_name="Priya Nair",
                           start_date="2026-04-01", tenure="2 Years")
        assert out["internal_entity"] == "IKS Health Solutions Private Limited"
        assert out["purpose"].startswith("Outsourced")
        assert "Marine Drive" in out["counterparty_address"]
        assert out["phi_shared"] is True
        assert out["spoc_name"] == "Priya Nair"
        assert out["tenure"] == "2 Years"

    def test_end_date_is_derived_from_the_tenure(self, client, admin_headers):
        """The register treats end dates as inclusive, so two years from
        1 April 2026 ends 31 March 2028 — the request must not disagree with the
        contract it becomes."""
        out = self._submit(client, admin_headers, start_date="2026-04-01", tenure="2 Years")
        assert out["start_date"] == "2026-04-01"
        assert out["end_date"] == "2028-03-31"

    def test_an_explicit_end_date_is_not_overridden(self, client, admin_headers):
        out = self._submit(client, admin_headers, start_date="2026-04-01",
                           tenure="2 Years", end_date="2027-06-30")
        assert out["end_date"] == "2027-06-30"

    def test_spoc_defaults_to_the_person_raising_it(self, client, admin_headers):
        out = self._submit(client, admin_headers)
        assert out["spoc_name"], "the SPOC should default to the signed-in user"
        assert out["spoc_name"] == "Test Admin"

    def test_intake_detail_carries_into_the_draft(self, client, admin_headers):
        out = self._submit(client, admin_headers,
                           internal_entity="IKS Entity Ltd", purpose="Night reporting",
                           counterparty_address="12 Marine Drive", phi_shared=True,
                           start_date="2026-04-01", tenure="2 Years")
        conv = client.post(f"/api/requests/{out['id']}/convert?origin=scratch", headers=admin_headers)
        assert conv.status_code == 200, conv.text
        fields = client.get(f"/api/authoring/drafts/{conv.json()['draft_id']}",
                            headers=admin_headers).json()["fields"]
        assert fields["signing_entity"] == "IKS Entity Ltd"
        assert fields["vendor_address"] == "12 Marine Drive"
        assert fields["service_summary"] == "Night reporting"
        assert fields["phi_shared"] is True
        assert fields["end_date"] == "2028-03-31"


class TestCounterpartyTemplate:
    def _submit(self, client, headers):
        r = client.post("/api/requests", headers=headers,
                        json={"title": "With their paper", "contract_type": "MSA"})
        return r.json()

    def test_attach_and_download(self, client, admin_headers):
        req = self._submit(client, admin_headers)
        body = b"%PDF-1.4 counterparty template"
        up = client.post(f"/api/requests/{req['id']}/template", headers=admin_headers,
                         files={"file": ("their-template.pdf", body, "application/pdf")})
        assert up.status_code == 200, up.text
        assert up.json()["template_filename"] == "their-template.pdf"

        got = client.get(f"/api/requests/{req['id']}/template", headers=admin_headers)
        assert got.status_code == 200
        assert got.content == body

    def test_executables_are_refused(self, client, admin_headers):
        req = self._submit(client, admin_headers)
        bad = client.post(f"/api/requests/{req['id']}/template", headers=admin_headers,
                          files={"file": ("payload.exe", b"MZ", "application/octet-stream")})
        assert bad.status_code == 415

    def test_missing_document_is_a_404_not_a_crash(self, client, admin_headers):
        req = self._submit(client, admin_headers)
        assert client.get(f"/api/requests/{req['id']}/template", headers=admin_headers).status_code == 404


class TestDraftDeletionReopensTheRequest:
    """Converting a request stores the draft id, but nothing put the edge back:
    deleting the draft left the request CONVERTED and pointing at a draft that
    no longer existed, so it never returned to anyone's queue."""

    def _converted(self, client, admin_headers):
        r = client.post("/api/requests", headers=admin_headers, json={
            "title": "MSA with Globex", "counterparty_name": "Globex",
            "contract_type": "MSA",
        }).json()
        conv = client.post(f"/api/requests/{r['id']}/convert", headers=admin_headers)
        assert conv.status_code == 200, conv.text
        return r["id"], conv.json()["draft_id"]

    def test_deleting_the_draft_returns_the_request_to_triage(self, client, admin_headers):
        rid, draft_id = self._converted(client, admin_headers)

        gone = client.delete(f"/api/authoring/drafts/{draft_id}", headers=admin_headers)
        assert gone.status_code == 200, gone.text
        assert gone.json()["requests_reopened"] == [rid]

        req = next(x for x in client.get("/api/requests", headers=admin_headers).json()["requests"]
                   if x["id"] == rid)
        assert req["status"] == "IN_REVIEW"
        assert req["draft_id"] is None

    def test_the_request_can_then_be_converted_again(self, client, admin_headers):
        rid, draft_id = self._converted(client, admin_headers)
        client.delete(f"/api/authoring/drafts/{draft_id}", headers=admin_headers)

        again = client.post(f"/api/requests/{rid}/convert", headers=admin_headers)
        assert again.status_code == 200, again.text
        assert again.json()["draft_id"] != draft_id
        assert again.json()["request"]["status"] == "CONVERTED"

    def test_restoring_the_draft_relinks_the_request(self, client, admin_headers):
        rid, draft_id = self._converted(client, admin_headers)
        client.delete(f"/api/authoring/drafts/{draft_id}", headers=admin_headers)

        back = client.post(f"/api/authoring/drafts/{draft_id}/restore-deleted", headers=admin_headers)
        assert back.status_code == 200, back.text
        req = next(x for x in client.get("/api/requests", headers=admin_headers).json()["requests"]
                   if x["id"] == rid)
        assert req["status"] == "CONVERTED"
        assert req["draft_id"] == draft_id

    def test_restore_does_not_steal_a_request_converted_since(self, client, admin_headers):
        """If the request was re-converted into a newer draft while the old one
        sat in retention, restoring the old draft must not pull it back."""
        rid, old_draft = self._converted(client, admin_headers)
        client.delete(f"/api/authoring/drafts/{old_draft}", headers=admin_headers)
        new_draft = client.post(f"/api/requests/{rid}/convert", headers=admin_headers).json()["draft_id"]

        client.post(f"/api/authoring/drafts/{old_draft}/restore-deleted", headers=admin_headers)
        req = next(x for x in client.get("/api/requests", headers=admin_headers).json()["requests"]
                   if x["id"] == rid)
        assert req["draft_id"] == new_draft


class TestRequesterRole:
    """A role for the people who raise requests: they can submit and follow
    their own, and can be asked to review a draft, but hold none of the
    authoring or validation powers."""

    def _requester(self, client, admin_headers, email="requester-role@example.com"):
        r = client.post("/api/auth/users", headers=admin_headers, json={
            "email": email, "name": "Rae Questor",
            "password": "password123", "roles": ["REQUESTER"]})
        assert r.status_code in (200, 201), r.text
        tok = client.post("/api/auth/login",
                          json={"email": email, "password": "password123"}).json()["token"]
        return {"Authorization": f"Bearer {tok}"}

    def test_the_role_can_be_assigned(self, client, admin_headers):
        h = self._requester(client, admin_headers)
        me = client.get("/api/auth/me", headers=h)
        assert me.status_code == 200, me.text
        assert me.json()["role"] == "REQUESTER"

    def test_a_requester_can_raise_and_see_their_own_request(self, client, admin_headers):
        h = self._requester(client, admin_headers, "raiser@example.com")
        made = client.post("/api/requests", headers=h, json={
            "title": "NDA with Globex", "counterparty_name": "Globex", "contract_type": "NDA"})
        assert made.status_code == 200, made.text
        mine = client.get("/api/requests", headers=h).json()
        assert [x["id"] for x in mine["requests"]] == [made.json()["id"]]
        assert mine["can_triage"] is False

    def test_a_requester_cannot_triage_or_author(self, client, admin_headers):
        h = self._requester(client, admin_headers, "notriage@example.com")
        made = client.post("/api/requests", headers=h, json={"title": "Something"}).json()
        assert client.post(f"/api/requests/{made['id']}/convert", headers=h).status_code == 403
        assert client.post("/api/authoring/drafts", headers=h,
                           json={"origin": "scratch", "contract_type": "MSA"}).status_code == 403

    def test_a_requester_can_read_the_register(self, client, admin_headers):
        h = self._requester(client, admin_headers, "reader@example.com")
        assert client.get("/api/contracts?limit=5", headers=h).status_code == 200

    def test_the_reviews_page_is_open_to_every_role(self, client, admin_headers):
        """Anyone can be asked to review, so anyone may need the page — it only
        shows the threads they are personally tagged in."""
        from app.services.page_access import DEFAULT_ACCESS, ROLES
        assert "REQUESTER" in ROLES
        assert set(DEFAULT_ACCESS["reviews"]) == set(ROLES)
