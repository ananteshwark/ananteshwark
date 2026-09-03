"""Phase J — clause terms as queryable data, exposure, trend, bulk operations."""
import uuid

UNCAPPED = ("8. Limitation of Liability. The Vendor accepts unlimited liability and "
            "there shall be no limit on the amounts recoverable under this agreement.")
CAPPED = ("8. Limitation of Liability. The aggregate liability of either party shall "
          "not exceed the fees paid in the preceding twelve (12) months.")
RENEWAL = ("12. Term. This agreement shall automatically renew for successive one-year "
           "terms unless either party gives 90 days written notice of termination.")
PAYMENT = "5. Payment. The Company shall pay each invoice Net 45 from receipt."
SLA = "6. Service Levels. The Provider guarantees 99.95% uptime availability monthly."
INDEMNITY = ("9. Indemnity. The Vendor shall indemnify and hold the Company harmless "
             "against all third party claims.")


def _seed(text, value=100000):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"J-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 status=ContractStatus.VALIDATED, contract_value=value, currency="INR",
                 extracted_text=text, raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


class TestJ1Extraction:
    def test_uncapped_liability_detected(self):
        from app.services.clause_attributes import extract_attributes
        a = extract_attributes(UNCAPPED)
        assert a["liability_capped"]["value"] is False
        assert a["liability_cap_basis"]["value"] == "uncapped"
        assert a["liability_capped"]["evidence"], "the source wording must be retained"

    def test_capped_liability_with_months(self):
        from app.services.clause_attributes import extract_attributes
        a = extract_attributes(CAPPED)
        assert a["liability_capped"]["value"] is True
        assert a["liability_cap_months"]["value"] == 12

    def test_renewal_and_notice(self):
        from app.services.clause_attributes import extract_attributes
        a = extract_attributes(RENEWAL)
        assert a["auto_renews"]["value"] is True
        assert a["notice_days"]["value"] == 90

    def test_payment_terms_and_uptime(self):
        from app.services.clause_attributes import extract_attributes
        assert extract_attributes(PAYMENT)["payment_days"]["value"] == 45
        assert extract_attributes(SLA)["uptime_pct"]["value"] == 99.95

    def test_indemnity_direction(self):
        from app.services.clause_attributes import extract_attributes
        assert extract_attributes(INDEMNITY)["indemnity_direction"]["value"] == "vendor_to_us"

    def test_nothing_invented_from_unrelated_text(self):
        from app.services.clause_attributes import extract_attributes
        assert extract_attributes("The weather in the valley is pleasant today.") == {}


class TestJ1Query:
    def test_uncapped_filter_is_a_filter_not_a_search(self, client, admin_headers):
        bad = _seed(UNCAPPED)
        good = _seed(CAPPED)
        client.post("/api/portfolio/extract-attributes?limit=500", headers=admin_headers)

        r = client.post("/api/portfolio/query", headers=admin_headers, json={
            "filters": [{"key": "liability_capped", "op": "eq", "value": False}]}).json()
        ids = [x["sr_no"] for x in r["items"]]
        assert bad in ids, "the uncapped contract must match"
        assert good not in ids, "a capped contract must NOT match — the text mentions liability too"

    def test_numeric_comparison(self, client, admin_headers):
        sr = _seed(RENEWAL)
        client.post("/api/portfolio/extract-attributes?limit=500", headers=admin_headers)
        r = client.post("/api/portfolio/query", headers=admin_headers, json={
            "filters": [{"key": "notice_days", "op": "gte", "value": 60}]}).json()
        assert sr in [x["sr_no"] for x in r["items"]]
        r2 = client.post("/api/portfolio/query", headers=admin_headers, json={
            "filters": [{"key": "notice_days", "op": "lt", "value": 30}]}).json()
        assert sr not in [x["sr_no"] for x in r2["items"]]

    def test_unknown_attribute_rejected(self, client, admin_headers):
        assert client.post("/api/portfolio/query", headers=admin_headers, json={
            "filters": [{"key": "made_up", "op": "eq", "value": 1}]}).status_code == 400

    def test_bad_operator_rejected(self, client, admin_headers):
        assert client.post("/api/portfolio/query", headers=admin_headers, json={
            "filters": [{"key": "notice_days", "op": "roughly", "value": 1}]}).status_code == 400

    def test_attribute_catalogue(self, client, admin_headers):
        cat = client.get("/api/portfolio/attributes", headers=admin_headers).json()
        keys = {a["key"] for a in cat["attributes"]}
        assert {"liability_capped", "notice_days", "auto_renews"} <= keys
        assert "gte" in cat["operators"]


class TestJ2Exposure:
    def test_exposure_counts_and_value(self, client, admin_headers):
        _seed(UNCAPPED, value=500000)
        client.post("/api/portfolio/extract-attributes?limit=500", headers=admin_headers)
        e = client.get("/api/portfolio/exposure", headers=admin_headers).json()
        assert e["uncapped_liability"]["count"] >= 1
        assert e["uncapped_liability"]["value_in_base"] >= 500000
        assert "base_currency" in e

    def test_risk_trend_series(self, client, admin_headers):
        t = client.get("/api/portfolio/risk-trend?months=6", headers=admin_headers).json()
        assert t["months"] == 6
        assert isinstance(t["series"], list)
        assert {"high", "medium", "low"} <= set(t["current"])
        for bucket in t["series"]:
            assert bucket["total"] == bucket["high"] + bucket["medium"] + bucket["low"]

    def test_risk_trend_bounds_validated(self, client, admin_headers):
        assert client.get("/api/portfolio/risk-trend?months=99",
                          headers=admin_headers).status_code == 422


class TestJ3BulkOps:
    def test_bulk_attributes_is_resumable(self, client, admin_headers):
        _seed(CAPPED)
        out = client.post("/api/portfolio/bulk-ai", headers=admin_headers,
                          json={"operation": "attributes", "limit": 5}).json()
        assert out["operation"] == "attributes"
        assert "remaining" in out and "processed" in out

    def test_bulk_risk_and_summarize(self, client, admin_headers):
        _seed(CAPPED)
        for op in ("risk", "summarize"):
            out = client.post("/api/portfolio/bulk-ai", headers=admin_headers,
                              json={"operation": op, "limit": 10}).json()
            assert out["operation"] == op

    def test_bulk_runs_to_completion(self, client, admin_headers):
        _seed(RENEWAL)
        for _ in range(30):
            out = client.post("/api/portfolio/bulk-ai", headers=admin_headers,
                              json={"operation": "attributes", "limit": 200}).json()
            if out["done"]:
                break
        assert out["done"] is True and out["remaining"] == 0

    def test_unknown_operation_rejected(self, client, admin_headers):
        assert client.post("/api/portfolio/bulk-ai", headers=admin_headers,
                           json={"operation": "teleport"}).status_code == 400


class TestPortfolioScale:
    """These endpoints answer questions about a small JSON column, and used to
    read every validated contract — body text included — into Python to do it."""

    def test_query_does_not_load_the_contract_body(self, client, admin_headers):
        from sqlalchemy import inspect

        from app.api.portfolio_api import _validated, _LIST_COLUMNS
        from app.database import SessionLocal
        from sqlalchemy.orm import load_only
        _seed(CAPPED)
        client.post("/api/portfolio/extract-attributes", headers=admin_headers)
        db = SessionLocal()
        try:
            row = _validated(db).options(load_only(*_LIST_COLUMNS)).first()
            assert row is not None
            assert "extracted_text" in inspect(row).unloaded, (
                "the contract body must not be loaded to filter on attributes")
            assert "clause_attributes" not in inspect(row).unloaded
        finally:
            db.close()

    def test_filter_narrows_in_sql_before_python_sees_it(self, client, admin_headers):
        """Rows lacking the attribute must be excluded in SQL, not read and
        discarded in Python.

        `scanned` counts what Python examined; for an existence filter every one
        of those rows should have matched. When the pushed-down predicate was
        silently a no-op under SQLite, Python examined rows the database should
        already have dropped and this ran ahead of the match count.
        """
        _seed(CAPPED)
        _seed("This agreement covers catering with no liability terms at all.")
        client.post("/api/portfolio/extract-attributes", headers=admin_headers)
        narrowed = client.post("/api/portfolio/query", headers=admin_headers,
                               json={"filters": [{"key": "liability_cap_amount",
                                                  "op": "exists"}]}).json()
        assert narrowed["scanned"] == narrowed["total"], (
            "every row read should have matched; the rest belong in the WHERE clause")
        assert narrowed["total"] == len(narrowed["items"])

    def test_query_reports_when_it_stopped_early(self, client, admin_headers):
        _seed(CAPPED)
        client.post("/api/portfolio/extract-attributes", headers=admin_headers)
        out = client.post("/api/portfolio/query", headers=admin_headers,
                          json={"filters": [], "limit": 1}).json()
        assert len(out["items"]) <= 1
        assert out["truncated"] is True, "a capped result has to say so"

    def test_report_defers_the_body_and_caps_rows(self, client, admin_headers):
        """Asserted against the SQL the report actually emits, so it cannot pass
        because of how the test happens to hold its objects."""
        from sqlalchemy import event

        from app.database import SessionLocal, engine
        from app.models import ReportDefinition
        from app.services.report_builder import MAX_ROWS, run_report
        _seed(CAPPED)
        statements = []

        def _record(conn, cursor, statement, params, context, executemany):
            statements.append(statement)

        db = SessionLocal()
        event.listen(engine, "before_cursor_execute", _record)
        try:
            d = ReportDefinition(name="scale", columns=["sr_no", "vendor_name", "department"],
                                 filters={}, sort="sr_no")
            out = run_report(db, d)
        finally:
            event.remove(engine, "before_cursor_execute", _record)
            db.close()

        assert out["total"] <= MAX_ROWS
        selects = [q for q in statements if "FROM contracts" in q]
        assert selects, "expected the report to query contracts"
        assert not any("contracts.extracted_text" in q for q in selects), (
            "no report column reads the contract body, so it must not be selected")
        assert any("LIMIT" in q.upper() for q in selects), "the row cap must reach SQL"
