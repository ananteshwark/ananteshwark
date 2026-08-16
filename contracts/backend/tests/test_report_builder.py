"""D4/G8 — custom report builder: definitions, run, CSV export, scheduling."""
import uuid


def _seed(ctype="MSA", value=100000):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"Rpt-{uuid.uuid4().hex[:5]}", contract_type=ctype,
                 status=ContractStatus.VALIDATED, contract_value=value, currency="INR",
                 extracted_text="x", raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


def test_report_crud_run_and_export(client, admin_headers):
    _seed(ctype="MSA", value=250000)
    _seed(ctype="NDA", value=0)
    d = client.post("/api/report-builder", headers=admin_headers, json={
        "name": "High-value MSAs", "filters": {"contract_type": "MSA", "value_min": 100000},
        "columns": ["sr_no", "vendor_name", "contract_value"], "sort": "contract_value"}).json()
    assert d["id"] and d["schedule"] == "none"

    res = client.post(f"/api/report-builder/{d['id']}/run", headers=admin_headers).json()
    assert [c["key"] for c in res["columns"]] == ["sr_no", "vendor_name", "contract_value"]
    assert res["total"] >= 1
    # every returned row is an MSA >= 100k (NDA with 0 excluded)
    val_idx = 2
    assert all(row[val_idx] is None or row[val_idx] >= 100000 for row in res["rows"])

    csv_resp = client.get(f"/api/report-builder/{d['id']}/export.csv", headers=admin_headers)
    assert csv_resp.status_code == 200 and csv_resp.headers["content-type"].startswith("text/csv")
    assert "Value" in csv_resp.text.splitlines()[0]


def test_columns_catalog(client, admin_headers):
    cols = client.get("/api/report-builder/columns", headers=admin_headers).json()["columns"]
    keys = {c["key"] for c in cols}
    assert {"sr_no", "vendor_name", "contract_value", "days_to_expiry"} <= keys


def test_custom_field_column(client, admin_headers):
    client.post("/api/custom-fields", headers=admin_headers, json={"label": "Region", "field_type": "text"})
    sr = _seed()
    client.put(f"/api/contracts/{sr}", headers=admin_headers, json={"custom_fields": {"region": "EMEA"}})
    d = client.post("/api/report-builder", headers=admin_headers, json={
        "name": "With region", "columns": ["sr_no", "cf_region"]}).json()
    res = client.post(f"/api/report-builder/{d['id']}/run", headers=admin_headers).json()
    row = next(r for r in res["rows"] if r[0] == sr)
    assert row[1] == "EMEA"


def test_schedule_due_logic():
    from datetime import date
    from app.services.report_delivery import _is_due
    from app.models import ReportDefinition
    daily = ReportDefinition(name="d", schedule="daily")
    assert _is_due(daily, date(2026, 8, 14)) is True
    weekly = ReportDefinition(name="w", schedule="weekly", schedule_day=4)  # Friday
    assert _is_due(weekly, date(2026, 8, 14)) is True   # 2026-08-14 is a Friday
    assert _is_due(weekly, date(2026, 8, 13)) is False
    monthly = ReportDefinition(name="m", schedule="monthly", schedule_day=1)
    assert _is_due(monthly, date(2026, 8, 1)) is True
    assert _is_due(monthly, date(2026, 8, 2)) is False
    assert _is_due(ReportDefinition(name="n", schedule="none"), date(2026, 8, 1)) is False
