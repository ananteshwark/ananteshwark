"""Tests for per-user saved Contracts-list filter presets."""


class TestSavedFilters:
    def test_create_list_upsert_and_delete(self, client, admin_headers):
        # create
        r = client.post("/api/saved-filters", headers=admin_headers, json={
            "name": "Legal pending",
            "params": {"status": "PENDING_VALIDATION", "contract_type": "MSA",
                       "junk": "ignored", "q": ""},
        })
        assert r.status_code == 200, r.text
        fid = r.json()["id"]
        # unknown keys and empty values are stripped
        assert r.json()["params"] == {"status": "PENDING_VALIDATION", "contract_type": "MSA"}

        # it lists for the owner
        listed = client.get("/api/saved-filters", headers=admin_headers).json()
        assert any(f["id"] == fid and f["name"] == "Legal pending" for f in listed)

        # re-saving the same name updates in place (no duplicate)
        r2 = client.post("/api/saved-filters", headers=admin_headers, json={
            "name": "legal pending", "params": {"status": "VALIDATED"},
        })
        assert r2.json()["id"] == fid
        assert r2.json()["params"] == {"status": "VALIDATED"}
        listed = client.get("/api/saved-filters", headers=admin_headers).json()
        assert sum(1 for f in listed if f["id"] == fid) == 1

        # blank name is rejected
        assert client.post("/api/saved-filters", headers=admin_headers,
                           json={"name": "  ", "params": {}}).status_code == 400

        # delete
        assert client.delete(f"/api/saved-filters/{fid}", headers=admin_headers).status_code == 200
        listed = client.get("/api/saved-filters", headers=admin_headers).json()
        assert all(f["id"] != fid for f in listed)
        # deleting again 404s
        assert client.delete(f"/api/saved-filters/{fid}", headers=admin_headers).status_code == 404

    def test_saved_filters_are_per_user(self, client, admin_headers):
        # a second user's saved filter is invisible to the admin and vice-versa
        email = "viewer_sf@example.com"
        client.post("/api/auth/users", headers=admin_headers,
                    json={"email": email, "name": "V", "password": "viewer12345", "role": "VIEWER"})
        token = client.post("/api/auth/login",
                            json={"email": email, "password": "viewer12345"}).json()["token"]
        vh = {"Authorization": f"Bearer {token}"}

        vf = client.post("/api/saved-filters", headers=vh,
                         json={"name": "My view", "params": {"status": "VALIDATED"}}).json()
        # admin cannot see it
        admin_list = client.get("/api/saved-filters", headers=admin_headers).json()
        assert all(f["id"] != vf["id"] for f in admin_list)
        # admin cannot delete it
        assert client.delete(f"/api/saved-filters/{vf['id']}", headers=admin_headers).status_code == 404
        # the owner still can
        assert client.delete(f"/api/saved-filters/{vf['id']}", headers=vh).status_code == 200


def test_saved_filter_keeps_all_filter_keys(client, admin_headers):
    """A saved view must round-trip every filter, not just the legacy subset."""
    params = {
        "status": ["VALIDATED"], "department_id": ["1"], "contract_type": ["MSA"],
        "tag_id": ["2"], "signing_entity": ["Acme"], "lifecycle_status": ["ACTIVE"],
        "phi_shared": "true", "q": "widget", "in_text": True,
        "expiring_days": "90", "sort": "value", "order": "asc",
    }
    r = client.post("/api/saved-filters", headers=admin_headers,
                    json={"name": "Everything", "params": params})
    assert r.status_code == 200, r.text
    saved = r.json()["params"]
    for key in ("signing_entity", "lifecycle_status", "phi_shared",
                "expiring_days", "sort", "order"):
        assert key in saved, f"{key} was dropped from the saved view"
    assert saved["sort"] == "value" and saved["order"] == "asc"
    assert saved["expiring_days"] == "90"
