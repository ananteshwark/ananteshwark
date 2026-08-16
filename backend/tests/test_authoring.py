"""Contract Authoring Module — document engine + API lifecycle tests."""
import uuid


class TestDocumentEngine:
    def test_scaffold_has_headings_and_merge_fields(self):
        from app.services.authoring import bound_fields, scaffold_document
        doc = scaffold_document("MSA")
        assert doc["type"] == "doc"
        fields = bound_fields(doc)
        assert {"signing_entity", "vendor", "start_date", "end_date"} <= fields

    def test_unknown_type_falls_back_to_generic(self):
        from app.services.authoring import scaffold_document
        doc = scaffold_document("Something Custom")
        assert doc["content"][0]["content"][0]["text"] == "CONTRACT"

    def test_number_to_words(self):
        from app.services.authoring import number_to_words
        assert number_to_words(0) == "zero"
        assert number_to_words(1250) == "one thousand two hundred fifty"
        assert number_to_words(1000000) == "one million"
        assert number_to_words(1250.5).endswith("and 50/100")
        assert number_to_words(None) == ""

    def test_recompute_end_date_and_words(self):
        from app.services.authoring import recompute_fields
        f = {"start_date": "2025-01-01", "contract_tenure": "12 Months", "contract_value": 1200}
        recompute_fields(f)
        assert f["end_date"] == "2025-12-31"
        assert f["contract_value_in_words"] == "one thousand two hundred"
        # 12 months over a full year normalizes to "1 Year"
        words = f["contract_tenure_in_words"]
        assert words and ("year" in words or "month" in words)

    def test_render_text_substitutes_merge_values(self):
        from app.services.authoring import render_text, scaffold_document
        doc = scaffold_document("NDA")
        text = render_text(doc, {"signing_entity": "TruBridge", "vendor": "Acme Ltd"})
        assert "TruBridge" in text and "Acme Ltd" in text
        assert "[vendor_address]" in text  # unbound placeholder shown as [field]


class TestAuthoringApi:
    def _create(self, client, headers, **body):
        r = client.post("/api/authoring/drafts", headers=headers, json=body)
        assert r.status_code == 200, r.text
        return r.json()

    def test_scratch_draft_and_autosave_versions(self, client, admin_headers):
        d = self._create(client, admin_headers, origin="scratch", contract_type="MSA")
        assert d["status"] == "DRAFT"
        assert d["document"]["type"] == "doc"
        did = d["id"]

        # Edit fields — derived values recompute, a version is snapshotted
        r = client.put(f"/api/authoring/drafts/{did}", headers=admin_headers, json={
            "fields": {"start_date": "2025-01-01", "contract_tenure": "12 Months",
                       "contract_value": 5000, "vendor": "Acme Ltd", "signing_entity": "TruBridge"},
            "note": "first edit",
        })
        assert r.status_code == 200, r.text
        f = r.json()["fields"]
        assert f["end_date"] == "2025-12-31"
        assert f["contract_value_in_words"].startswith("five thousand")

        versions = client.get(f"/api/authoring/drafts/{did}/versions", headers=admin_headers).json()
        assert len(versions) >= 2  # created + edit

    def test_diff_and_restore(self, client, admin_headers):
        d = self._create(client, admin_headers, origin="scratch", contract_type="SOW")
        did = d["id"]
        client.put(f"/api/authoring/drafts/{did}", headers=admin_headers,
                   json={"fields": {"vendor": "Vendor One"}})
        client.put(f"/api/authoring/drafts/{did}", headers=admin_headers,
                   json={"fields": {"vendor": "Vendor Two"}})
        versions = client.get(f"/api/authoring/drafts/{did}/versions", headers=admin_headers).json()
        latest = versions[0]["version_no"]
        first = versions[-1]["version_no"]
        diff = client.get(f"/api/authoring/drafts/{did}/diff?a={first}&b={latest}",
                          headers=admin_headers).json()
        assert any("Vendor Two" in line for line in diff["diff"])
        # restore the first version
        r = client.post(f"/api/authoring/drafts/{did}/restore/{first}", headers=admin_headers)
        assert r.status_code == 200

    def test_duplicate_clears_instance_fields_and_keeps_vendor(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, Vendor
        from app.services.vendor_matching import normalize_vendor_name
        db = SessionLocal()
        vname = f"DupVendor-{uuid.uuid4().hex[:6]}"
        vendor = Vendor(name=vname, normalized_name=normalize_vendor_name(vname))
        db.add(vendor); db.flush()
        src = Contract(vendor_id=vendor.id, signing_entity="TruBridge", contract_type="MSA",
                       po_number="PO-999", contract_value=1234, start_date=__import__("datetime").date(2024, 1, 1),
                       status=ContractStatus.VALIDATED, raw_extracted={}, confidence={})
        db.add(src); db.commit(); src_sr, vid = src.sr_no, vendor.id; db.close()

        # Plain duplicate (not a renewal) clears the instance-specific values.
        d = self._create(client, admin_headers, origin="duplicate", source_contract_id=src_sr)
        assert d["fields"]["signing_entity"] == "TruBridge"   # kept
        assert d["fields"]["po_number"] is None               # cleared
        assert d["fields"]["contract_value"] is None          # cleared
        assert d["fields"]["start_date"] is None              # cleared
        assert d["vendor_id"] == vid
        assert d["source_contract_id"] == src_sr

    def test_template_create_instantiate_and_promote(self, client, admin_headers):
        # Create a template, author a draft from it, then promote a draft back.
        t = client.post("/api/authoring/templates", headers=admin_headers, json={
            "name": f"Std MSA {uuid.uuid4().hex[:5]}", "contract_type": "MSA",
            "field_defaults": {"currency": "USD", "payment_term": "Net 45"},
        }).json()
        d = self._create(client, admin_headers, origin="template", template_id=t["id"])
        assert d["fields"]["currency"] == "USD"
        assert d["fields"]["payment_term"] == "Net 45"
        assert d["template_id"] == t["id"]

        promoted = client.post(f"/api/authoring/drafts/{d['id']}/promote-template", headers=admin_headers,
                               json={"name": f"Promoted {uuid.uuid4().hex[:5]}"}).json()
        assert promoted["field_defaults"].get("currency") == "USD"

    def test_template_versioning(self, client, admin_headers):
        t = client.post("/api/authoring/templates", headers=admin_headers, json={
            "name": f"Ver {uuid.uuid4().hex[:5]}", "contract_type": "NDA"}).json()
        v2 = client.put(f"/api/authoring/templates/{t['id']}", headers=admin_headers, json={
            "name": t["name"], "contract_type": "NDA", "description": "v2"}).json()
        assert v2["version"] == 2 and v2["parent_id"] == t["id"] and v2["is_active"] is True
        old = client.get(f"/api/authoring/templates/{t['id']}", headers=admin_headers).json()
        assert old["is_active"] is False

    def test_finalize_creates_pending_contract_and_links_renewal(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, Vendor
        from app.services.vendor_matching import normalize_vendor_name
        db = SessionLocal()
        vname = f"FinVendor-{uuid.uuid4().hex[:6]}"
        vendor = Vendor(name=vname, normalized_name=normalize_vendor_name(vname))
        db.add(vendor); db.flush()
        parent = Contract(vendor_id=vendor.id, signing_entity="TruBridge", contract_type="MSA",
                          status=ContractStatus.VALIDATED, raw_extracted={}, confidence={}, thread_id=None)
        db.add(parent); db.flush(); parent.thread_id = parent.sr_no
        db.commit(); parent_sr = parent.sr_no; db.close()

        d = self._create(client, admin_headers, origin="duplicate", source_contract_id=parent_sr,
                         link_as="renewal")
        client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers, json={
            "fields": {"start_date": "2026-01-01", "contract_tenure": "12 Months",
                       "contract_service": "Managed services", "po_number": "PO-2026"},
        })
        r = client.post(f"/api/authoring/drafts/{d['id']}/finalize", headers=admin_headers)
        assert r.status_code == 200, r.text
        sr = r.json()["contract_id"]
        assert r.json()["status"] == "PENDING_VALIDATION"

        detail = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
        assert detail["contract_type"] == "MSA"
        assert detail["renews_contract_id"] == parent_sr
        assert detail["thread_id"] == parent_sr        # joined the renewal chain
        assert detail["end_date"] == "2026-12-31"       # derived on finalize

        # Draft is now read-only
        assert client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers,
                          json={"title": "x"}).status_code == 409
