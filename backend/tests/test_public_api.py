"""E3/G17 — API tokens, documented read-only REST API, and event catalog."""
import uuid


def _seed():
    from app.database import SessionLocal
    from app.models import Contract, ContractStatus
    db = SessionLocal()
    c = Contract(vendor_name_raw=f"Api-{uuid.uuid4().hex[:5]}", contract_type="MSA",
                 status=ContractStatus.VALIDATED, contract_value=100000, currency="INR",
                 extracted_text="x", raw_extracted={}, confidence={})
    db.add(c); db.commit(); sr = c.sr_no; db.close()
    return sr


def test_token_lifecycle_and_api_access(client, admin_headers):
    sr = _seed()
    created = client.post("/api/api-tokens", headers=admin_headers, json={"name": "BI tool"}).json()
    raw = created["token"]
    assert raw.startswith("cms_") and created["prefix"]

    # listing never returns the raw token again
    listed = client.get("/api/api-tokens", headers=admin_headers).json()
    assert all("token" not in t for t in listed)

    key = {"X-API-Key": raw}
    assert client.get("/api/v1/ping", headers=key).json()["ok"] is True

    items = client.get("/api/v1/contracts", headers=key).json()
    assert items["total"] >= 1 and any(c["sr_no"] == sr for c in items["items"])
    one = client.get(f"/api/v1/contracts/{sr}", headers=key).json()
    assert one["sr_no"] == sr

    # revoke → 401
    client.post(f"/api/api-tokens/{created['id']}/revoke", headers=admin_headers)
    assert client.get("/api/v1/ping", headers=key).status_code == 401


def test_api_requires_valid_key(client):
    assert client.get("/api/v1/ping").status_code == 401
    assert client.get("/api/v1/ping", headers={"X-API-Key": "cms_bogus"}).status_code == 401


def test_event_catalog(client, admin_headers):
    created = client.post("/api/api-tokens", headers=admin_headers, json={"name": "cat"}).json()
    key = {"X-API-Key": created["token"]}
    cat = client.get("/api/v1/events/catalog", headers=key).json()["events"]
    names = {e["event"] for e in cat}
    assert {"contract.validated", "contract.rejected"} <= names
    assert all("sample_payload" in e for e in cat)


def test_expired_token_rejected(client, admin_headers):
    created = client.post("/api/api-tokens", headers=admin_headers,
                          json={"name": "expired", "expires_on": "2020-01-01"}).json()
    assert client.get("/api/v1/ping", headers={"X-API-Key": created["token"]}).status_code == 401
