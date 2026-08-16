"""R5 3.8: field-level permissions on authoring register fields."""


def _author_token(client, admin_headers, role="AUTHOR"):
    email = f"{role.lower()}_fp@example.com"
    client.post("/api/auth/users", headers=admin_headers,
                json={"email": email, "name": role, "password": "password12345", "role": role})
    return client.post("/api/auth/login", json={"email": email, "password": "password12345"}).json()["token"]


def _set_restricted(client, admin_headers, value):
    client.put("/api/settings", headers=admin_headers,
               json={"values": {"restricted_authoring_fields": value}})


def test_author_blocked_from_restricted_field(client, admin_headers):
    _set_restricted(client, admin_headers, "contract_value")
    token = _author_token(client, admin_headers, "AUTHOR")
    h = {"Authorization": f"Bearer {token}"}
    d = client.post("/api/authoring/drafts", headers=h,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()

    policy = client.get("/api/authoring/field-policy", headers=h).json()
    assert "contract_value" in policy["restricted"] and policy["can_edit_restricted"] is False

    r = client.put(f"/api/authoring/drafts/{d['id']}", headers=h,
                   json={"fields": {"contract_value": 5000}})
    assert r.status_code == 403
    # a non-restricted field still saves
    ok = client.put(f"/api/authoring/drafts/{d['id']}", headers=h,
                    json={"fields": {"contract_service": "ok"}})
    assert ok.status_code == 200
    _set_restricted(client, admin_headers, "")


def test_legal_can_edit_restricted_field(client, admin_headers):
    _set_restricted(client, admin_headers, "contract_value")
    token = _author_token(client, admin_headers, "LEGAL")
    h = {"Authorization": f"Bearer {token}"}
    d = client.post("/api/authoring/drafts", headers=h,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    policy = client.get("/api/authoring/field-policy", headers=h).json()
    assert policy["can_edit_restricted"] is True
    r = client.put(f"/api/authoring/drafts/{d['id']}", headers=h,
                   json={"fields": {"contract_value": 5000}})
    assert r.status_code == 200
    _set_restricted(client, admin_headers, "")
