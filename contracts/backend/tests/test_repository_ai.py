"""Phase C — repository AI: abstract/summary, semantic search, and Q&A.
All exercised on the offline (no-AI) path, which must fully work air-gapped."""
import uuid


def _seed(vendor="Globex Health", service="managed radiology reads",
          ctype="MSA", text=None, value=250000):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(
        vendor_name_raw=f"{vendor}-{uuid.uuid4().hex[:5]}", contract_type=ctype,
        contract_service=service, contract_value=value, currency="INR",
        signing_entity=vendor, status=ContractStatus.VALIDATED,
        extracted_text=text or f"This {ctype} covers {service}. Either party may terminate on 60 days notice.",
        raw_extracted={}, confidence={},
    )
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


class TestAbstract:
    def test_build_summary_offline(self, client):
        from app.database import SessionLocal
        from app.models import Contract
        from app.services.contract_ai import build_summary, key_terms
        sr = _seed()
        db = SessionLocal()
        c = db.get(Contract, sr)
        out = build_summary(db, c)
        assert out["summary"] and "MSA" in out["summary"]
        labels = {t["label"] for t in key_terms(c)}
        assert "Counterparty" in labels and "Value" in labels
        db.close()

    def test_summarize_endpoint_and_detail(self, client, admin_headers):
        sr = _seed(vendor="Initech", service="payroll processing")
        r = client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json()["summary"]
        detail = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
        assert detail["ai_summary"] and detail["ai_indexed_at"]
        assert any(t["label"] == "Counterparty" for t in detail["ai_key_terms"])

    def test_counterparty_is_the_other_side_not_our_own_entity(self, client, admin_headers):
        """The abstract used to read `signing_entity or vendor_name_raw`, so on
        every contract with an internal entity filled in it introduced us as our
        own counterparty."""
        from app.database import SessionLocal
        from app.models import Contract
        sr = _seed(vendor="Globex Health")
        db = SessionLocal()
        c = db.get(Contract, sr)
        c.signing_entity = "IKS Health Pvt Ltd"
        vendor_name = c.vendor_name_raw
        db.commit(); db.close()

        r = client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        assert r.status_code == 200, r.text
        terms = {t["label"]: t["value"] for t in r.json()["key_terms"]}
        assert terms["Counterparty"] == vendor_name
        assert terms["Internal entity"] == "IKS Health Pvt Ltd"
        assert vendor_name in r.json()["summary"]

    def test_master_vendor_record_wins_over_the_raw_name(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, Vendor
        sr = _seed()
        db = SessionLocal()
        v = Vendor(name="Globex Health Systems", normalized_name="globex health systems")
        db.add(v); db.flush()
        c = db.get(Contract, sr)
        c.vendor_id = v.id
        c.signing_entity = "IKS Health Pvt Ltd"
        db.commit(); db.close()

        r = client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        terms = {t["label"]: t["value"] for t in r.json()["key_terms"]}
        assert terms["Counterparty"] == "Globex Health Systems"


class TestSearchAndAsk:
    def test_semantic_search_ranks_relevant(self, client, admin_headers):
        radiology = _seed(vendor="Globex", service="radiology imaging reads",
                          text="Provider delivers teleradiology imaging interpretation services for hospitals.")
        catering = _seed(vendor="Acme Foods", service="cafeteria catering",
                         text="Vendor provides on-site cafeteria catering and food services.")
        for sr in (radiology, catering):
            client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        res = client.get("/api/repo-ai/search?q=medical imaging radiology&limit=5", headers=admin_headers).json()
        ids = [r["sr_no"] for r in res["results"]]
        assert radiology in ids
        # radiology should outrank catering for this query
        assert ids.index(radiology) < (ids.index(catering) if catering in ids else 99)

    def test_keyword_hit_flag(self, client, admin_headers):
        sr = _seed(vendor="Umbrella Corp", service="biohazard disposal",
                   text="Umbrella Corp handles specialised biohazard disposal and containment.")
        client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        res = client.get("/api/repo-ai/search?q=biohazard&limit=5", headers=admin_headers).json()
        hit = next(r for r in res["results"] if r["sr_no"] == sr)
        assert hit["keyword_hit"] is True

    def test_ask_offline_returns_citations(self, client, admin_headers):
        # A distinctive term, so this tests retrieval rather than which of many
        # similar SLA contracts happens to win a crowded ranking.
        marker = f"ZANTHUM{uuid.uuid4().hex[:6].upper()}"
        sr = _seed(vendor="Wayne Enterprises", service="security systems",
                   text=f"Wayne Enterprises supplies {marker} integrated security systems "
                        f"with a 99.9% uptime SLA.")
        client.post(f"/api/repo-ai/contracts/{sr}/summarize", headers=admin_headers)
        r = client.post("/api/repo-ai/ask", headers=admin_headers,
                        json={"question": f"which contract mentions {marker}?"}).json()
        assert r["ai"] is False  # no model configured in tests
        assert any(c["sr_no"] == sr for c in r["citations"])

    def test_reindex_is_bounded(self, client, admin_headers):
        _seed(vendor="Stark Industries", service="arc reactor maintenance")
        out = client.post("/api/repo-ai/reindex?limit=100", headers=admin_headers).json()
        assert "indexed" in out and "remaining" in out
        assert out["indexed"] >= 1
