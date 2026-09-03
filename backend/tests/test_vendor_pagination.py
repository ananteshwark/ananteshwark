"""Server-side pagination + eager-loaded aliases for the vendors list."""
from app.database import SessionLocal
from app.models import Contract, ContractStatus, Vendor, VendorAlias
from app.services.vendor_matching import normalize_vendor_name


def _seed(n=12):
    db = SessionLocal()
    for i in range(n):
        name = f"PageVendor {i:02d}"
        v = Vendor(name=name, normalized_name=normalize_vendor_name(name))
        db.add(v)
        db.flush()
        db.add(VendorAlias(vendor_id=v.id, alias=f"PV{i:02d}",
                           normalized_alias=normalize_vendor_name(f"PV{i:02d}")))
    db.commit()
    db.close()


def test_paginate_envelope_and_offset(client, admin_headers):
    _seed(12)
    r = client.get("/api/vendors?paginate=true&limit=5&offset=0", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"items", "total", "limit", "offset"}
    assert body["limit"] == 5 and body["offset"] == 0
    assert body["total"] >= 12
    assert len(body["items"]) == 5
    # Aliases are serialized (eager-loaded) without a separate round-trip.
    assert all("aliases" in item for item in body["items"])

    page2 = client.get("/api/vendors?paginate=true&limit=5&offset=5", headers=admin_headers).json()
    names1 = {i["name"] for i in body["items"]}
    names2 = {i["name"] for i in page2["items"]}
    assert names1.isdisjoint(names2)  # no overlap across pages


def test_default_list_is_flat_and_backward_compatible(client, admin_headers):
    _seed(3)
    r = client.get("/api/vendors", headers=admin_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)  # unchanged shape for autocomplete/dashboard


def test_sort_by_contracts_desc(client, admin_headers):
    # A shared prefix so the assertion can be scoped to this test's own two
    # vendors. Reading the first 100 of the whole register made this depend on
    # how many vendors every other test happened to have created: the idle
    # vendor sorts last under contracts-desc, so it fell off the page as soon
    # as the corpus grew, and the failure looked like a sorting bug.
    busy_name, idle_name = "VPSORT ZZZ Busy", "VPSORT AAA Idle"
    db = SessionLocal()
    a = Vendor(name=busy_name, normalized_name=normalize_vendor_name(busy_name))
    b = Vendor(name=idle_name, normalized_name=normalize_vendor_name(idle_name))
    db.add_all([a, b])
    db.flush()
    for _ in range(3):
        db.add(Contract(vendor_id=a.id, vendor_name_raw=busy_name, contract_service="s",
                        status=ContractStatus.VALIDATED, raw_extracted={}, confidence={}))
    db.commit()
    db.close()

    body = client.get(
        "/api/vendors?paginate=true&sort=contracts&order=desc&limit=100&q=VPSORT",
        headers=admin_headers,
    ).json()
    names = [i["name"] for i in body["items"]]
    assert busy_name in names and idle_name in names, names
    # The busy vendor sorts ahead of the idle one under contracts-desc.
    assert names.index(busy_name) < names.index(idle_name)
