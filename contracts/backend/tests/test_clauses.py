"""Clause Intelligence — segmentation, clustering, gap analysis + API."""
import uuid


class TestClassificationAndClustering:
    def test_classify_by_keywords(self):
        from app.services.clauses import classify_clause
        assert classify_clause("The parties agree to keep all Confidential Information secret.") == "Confidentiality"
        assert classify_clause("Either party may terminate this agreement on 30 days notice.") == "Exit/Termination"
        assert classify_clause("This Agreement is governed by the laws of India; courts at Mumbai.") \
            == "Governing Law & Jurisdiction"
        assert classify_clause("The quick brown fox.") is None

    def test_segment_and_classify(self):
        from app.services.clauses import segment_and_classify
        text = ("1. Confidentiality. Each party shall keep information confidential and proprietary.\n\n"
                "2. Payment Terms. Customer shall pay each invoice within Net 30 days of receipt.\n\n"
                "short")
        found = {c["clause_type"] for c in segment_and_classify(text)}
        assert "Confidentiality" in found and "Payment Terms" in found

    def test_clustering_matches_near_duplicates(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app.database import Base
        from app.services.clauses import match_or_create_version
        eng = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(eng)
        db = sessionmaker(bind=eng)()
        base = "The liability of each party shall not exceed twelve months of fees paid under this agreement."
        v1, c1 = match_or_create_version(db, "Limitation of Liability", base)
        assert c1 is True
        # near-identical (punctuation/case) -> same version
        v2, c2 = match_or_create_version(db, "Limitation of Liability", base.upper() + "  ")
        assert c2 is False and v2.id == v1.id
        # materially different -> new version
        v3, c3 = match_or_create_version(db, "Limitation of Liability",
                                         "Liability under this agreement shall be unlimited for data breaches and gross negligence claims.")
        assert c3 is True and v3.id != v1.id


class TestGapAnalysis:
    def test_missing_and_score(self):
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from app.database import Base
        from app import models
        from app.services.clauses import analyze_gaps
        eng = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(eng)
        db = sessionmaker(bind=eng)()
        # A thin MSA draft with only a confidentiality clause present
        draft = models.ContractDraft(
            title="d", contract_type="MSA", status=models.DraftStatus.DRAFT,
            fields={"vendor": "Acme"},
            document={"type": "doc", "content": [
                {"type": "paragraph", "content": [{"type": "text",
                 "text": "Each party shall keep all Confidential Information secret and proprietary."}]},
            ]},
        )
        db.add(draft); db.flush()
        result = analyze_gaps(db, draft)
        missing_types = {m["clause_type"] for m in result["missing"]}
        assert "Indemnity" in missing_types and "Payment Terms" in missing_types
        assert "Confidentiality" not in missing_types
        assert 0 <= result["score"] <= 100
        # vendor set but not in body -> inconsistency
        assert any(i["type"] == "field_body_mismatch" for i in result["inconsistencies"])


class TestClauseApi:
    def _seed_contract_with_text(self, text, ctype="MSA"):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw=f"CV-{uuid.uuid4().hex[:6]}", contract_type=ctype,
                     status=ContractStatus.VALIDATED, extracted_text=text,
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        return sr

    def test_learn_then_search_and_manage(self, client, admin_headers):
        self._seed_contract_with_text(
            "1. Indemnity. The Vendor shall indemnify and hold harmless the Company against all claims.\n\n"
            "2. Payment Terms. The Company shall pay each invoice within Net 45 days.\n\n"
            "3. Confidentiality. Each party shall keep Confidential Information secret.")
        r = client.post("/api/clauses/learn?reset=true", headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json()["clauses"] >= 3

        # search finds an Indemnity version
        res = client.get("/api/clauses?clause_type=Indemnity", headers=admin_headers).json()
        assert len(res) >= 1
        vid = res[0]["id"]

        # approve + set risk posture, then it shows approved
        client.put(f"/api/clauses/versions/{vid}", headers=admin_headers,
                   json={"risk_posture": "COMPANY_FAVOURABLE"})
        appr = client.post(f"/api/clauses/versions/{vid}/approve", headers=admin_headers).json()
        assert appr["status"] == "APPROVED" and appr["legal_approved"] is True

        # detail carries usage + text
        detail = client.get(f"/api/clauses/{vid}", headers=admin_headers).json()
        assert detail["text"] and detail["usage_count"] >= 1

    def test_taxonomy_get_set(self, client, admin_headers):
        base = client.get("/api/clauses/taxonomy", headers=admin_headers).json()["types"]
        assert "Indemnity" in base
        custom = base + [f"Custom-{uuid.uuid4().hex[:5]}"]
        out = client.put("/api/clauses/taxonomy", headers=admin_headers, json={"types": custom}).json()
        assert out["types"][-1].startswith("Custom-")

    def test_merge_versions(self, client, admin_headers):
        a = client.post("/api/clauses/versions", headers=admin_headers, json={
            "clause_type": f"MergeType-{uuid.uuid4().hex[:5]}", "text": "Alpha clause text one two three."}).json()
        b = client.post("/api/clauses/versions", headers=admin_headers, json={
            "clause_type": a["clause_type"], "text": "A completely different clause body four five six."}).json()
        merged = client.post("/api/clauses/versions/merge", headers=admin_headers,
                             json={"keep_id": a["id"], "merge_id": b["id"]}).json()
        assert merged["id"] == a["id"]
        # merged version is gone
        assert client.get(f"/api/clauses/{b['id']}", headers=admin_headers).status_code == 404

    def test_playbook_tiers(self, client, admin_headers):
        ctype = f"Playbook-{uuid.uuid4().hex[:5]}"
        a = client.post("/api/clauses/versions", headers=admin_headers, json={
            "clause_type": ctype, "text": "Standard indemnity wording, mutual and capped at fees."}).json()
        b = client.post("/api/clauses/versions", headers=admin_headers, json={
            "clause_type": ctype, "text": "Fallback indemnity wording, one-way but time-limited to twelve months."}).json()

        # designate tiers (admin is allowed as require_legal admits ADMIN/SUPER_ADMIN)
        r = client.post(f"/api/clauses/versions/{a['id']}/playbook-tier", headers=admin_headers,
                        json={"tier": "standard"})
        assert r.status_code == 200, r.text
        assert r.json()["playbook_tier"] == "standard"
        client.post(f"/api/clauses/versions/{b['id']}/playbook-tier", headers=admin_headers,
                    json={"tier": "fallback"})

        # bad tier rejected
        assert client.post(f"/api/clauses/versions/{a['id']}/playbook-tier", headers=admin_headers,
                           json={"tier": "nonsense"}).status_code == 400

        # playbook view groups by type into tiers
        pb = client.get(f"/api/clauses/playbook?clause_type={ctype}", headers=admin_headers).json()
        assert len(pb) == 1 and pb[0]["clause_type"] == ctype
        assert len(pb[0]["tiers"]["standard"]) == 1 and pb[0]["tiers"]["standard"][0]["id"] == a["id"]
        assert len(pb[0]["tiers"]["fallback"]) == 1 and pb[0]["tiers"]["fallback"][0]["id"] == b["id"]

        # setting a second 'standard' demotes the prior one to fallback
        client.post(f"/api/clauses/versions/{b['id']}/playbook-tier", headers=admin_headers,
                    json={"tier": "standard"})
        assert client.get(f"/api/clauses/{a['id']}", headers=admin_headers).json()["playbook_tier"] == "fallback"

        # clearing removes it from the playbook
        client.post(f"/api/clauses/versions/{a['id']}/playbook-tier", headers=admin_headers, json={"tier": None})
        assert client.get(f"/api/clauses/{a['id']}", headers=admin_headers).json()["playbook_tier"] is None

    def test_playbook_deviation_scoring(self, client, admin_headers):
        std_text = "The Vendor shall indemnify and hold harmless the Company against all third-party claims, capped at fees paid."
        fb_text = "The Vendor shall indemnify the Company for direct third-party claims only, limited to twelve months of fees."
        std = client.post("/api/clauses/versions", headers=admin_headers,
                          json={"clause_type": "Indemnity", "text": std_text}).json()
        fb = client.post("/api/clauses/versions", headers=admin_headers,
                         json={"clause_type": "Indemnity", "text": fb_text}).json()
        client.post(f"/api/clauses/versions/{std['id']}/playbook-tier", headers=admin_headers, json={"tier": "standard"})
        client.post(f"/api/clauses/versions/{fb['id']}/playbook-tier", headers=admin_headers, json={"tier": "fallback"})

        # A draft whose Indemnity clause matches the fallback wording verbatim
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers, json={"document": {
            "type": "doc", "content": [
                {"type": "heading", "content": [{"type": "text", "text": "Indemnity"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": fb_text}]},
            ]}})
        rep = client.get(f"/api/authoring/drafts/{d['id']}/deviations", headers=admin_headers).json()
        assert rep["configured"] is True
        ind = next(x for x in rep["deviations"] if x["clause_type"] == "Indemnity")
        assert ind["position"] == "fallback"
        assert rep["risk_score"] > 0

    def test_clause_map_third_party(self, client, admin_headers):
        # A library version + playbook tier to map against.
        std_text = "Each party shall keep all Confidential Information secret and proprietary at all times."
        v = client.post("/api/clauses/versions", headers=admin_headers,
                        json={"clause_type": "Confidentiality", "text": std_text}).json()
        client.post(f"/api/clauses/versions/{v['id']}/playbook-tier", headers=admin_headers, json={"tier": "standard"})

        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "NDA"}).json()
        client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers, json={"document": {
            "type": "doc", "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": std_text}]},
                {"type": "paragraph", "content": [{"type": "text",
                 "text": "The kangaroo hops across the meadow under a bright and cloudless sky today."}]},
            ]}})
        m = client.get(f"/api/authoring/drafts/{d['id']}/clause-map", headers=admin_headers).json()
        assert m["has_playbook"] is True
        conf = next(c for c in m["clauses"] if c["clause_type"] == "Confidentiality")
        assert conf["matched_version_id"] == v["id"]
        assert conf["playbook_position"] == "standard"
        # the nonsense block is unmapped
        assert m["unmapped"] >= 1

    def test_draft_review_and_insert_clause(self, client, admin_headers):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "NDA"}).json()
        review = client.post(f"/api/authoring/drafts/{d['id']}/review", headers=admin_headers).json()
        assert "score" in review and isinstance(review["missing"], list)

        before = len((d["document"] or {}).get("content", []))
        upd = client.post(f"/api/authoring/drafts/{d['id']}/insert-clause", headers=admin_headers, json={
            "clause_type": "Indemnity", "text": "The Vendor shall indemnify the Company against all claims."}).json()
        after = len(upd["document"]["content"])
        assert after == before + 2   # heading + paragraph
