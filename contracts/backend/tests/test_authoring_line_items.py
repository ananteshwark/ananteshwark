"""R3 2.10: line items (and location) authored on a draft flow to the register."""


def _draft(client, h):
    return client.post("/api/authoring/drafts", headers=h,
                       json={"origin": "scratch", "contract_type": "MSA"}).json()


def test_line_items_and_location_finalize_into_contract(client, admin_headers):
    d = _draft(client, admin_headers)
    # author the mandatory fields + line items + location on the draft
    dept = client.post("/api/departments", headers=admin_headers, json={"name": "LIDept"}).json()
    client.put(f"/api/authoring/drafts/{d['id']}", headers=admin_headers, json={
        "department_id": dept["id"],
        "fields": {
            "signing_entity": "Inventurus", "vendor": "LI Vendor",
            "start_date": "2026-01-01", "end_date": "2026-12-31",
            "contract_service": "svc", "po_number": "PO-LI-1",
            "location": "Mumbai",
            "line_items": [
                {"item": "Widgets", "unit": "ea", "quantity": 10, "unit_rate": 5, "amount": 50},
                {"item": "Setup", "unit": "job", "quantity": 1, "unit_rate": 100, "amount": 100},
            ],
        },
    })
    res = client.post(f"/api/authoring/drafts/{d['id']}/finalize", headers=admin_headers).json()
    sr = res["contract_id"]
    out = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
    assert out["location"] == "Mumbai"
    assert len(out["line_items"]) == 2
    assert out["line_items"][0]["item"] == "Widgets"
    assert out["line_items"][1]["amount"] == 100
