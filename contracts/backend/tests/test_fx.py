"""E5/G15 — FX rates + portfolio-value normalization to a base currency."""
import uuid


def _seed(value, currency):
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"Fx-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 status=ContractStatus.VALIDATED, contract_value=value, currency=currency,
                 extracted_text="x", raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


def test_fx_rate_crud(client, admin_headers):
    r = client.put("/api/fx/rates", headers=admin_headers, json={"currency": "usd", "rate_to_base": 83.5}).json()
    assert r["currency"] == "USD" and r["rate_to_base"] == 83.5
    # update in place
    client.put("/api/fx/rates", headers=admin_headers, json={"currency": "USD", "rate_to_base": 84})
    rates = client.get("/api/fx/rates", headers=admin_headers).json()
    usd = next(x for x in rates["rates"] if x["currency"] == "USD")
    assert usd["rate_to_base"] == 84
    # bad rate rejected
    assert client.put("/api/fx/rates", headers=admin_headers,
                      json={"currency": "EUR", "rate_to_base": -1}).status_code == 400
    client.delete("/api/fx/rates/USD", headers=admin_headers)


def test_portfolio_value_normalized(client, admin_headers):
    # base is INR by default; add a USD rate and one contract in each currency
    client.put("/api/fx/rates", headers=admin_headers, json={"currency": "USD", "rate_to_base": 80})
    _seed(100000, "INR")
    _seed(1000, "USD")   # -> 80,000 INR
    pv = client.get("/api/fx/portfolio-value", headers=admin_headers).json()
    assert pv["base_currency"] == "INR"
    # total_in_base includes both, USD converted at 80
    assert pv["total_in_base"] >= 180000
    usd = next(b for b in pv["by_currency"] if b["currency"] == "USD")
    assert usd["in_base"] == 80000
    client.delete("/api/fx/rates/USD", headers=admin_headers)


def test_unconvertible_currency_flagged(client, admin_headers):
    _seed(500, "XYZ")   # no rate for XYZ
    pv = client.get("/api/fx/portfolio-value", headers=admin_headers).json()
    assert any(u["currency"] == "XYZ" for u in pv["unconvertible"])


def test_spend_summary_has_base_total(client, admin_headers):
    _seed(100000, "INR")
    s = client.get("/api/payments/summary", headers=admin_headers).json()
    assert "base_currency" in s and "spend_under_management_base" in s
