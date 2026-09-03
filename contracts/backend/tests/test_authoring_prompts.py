"""R3 2.9: versioned, admin-editable authoring prompts."""


def test_catalog_lists_authoring_prompts(client, admin_headers):
    cat = client.get("/api/settings/prompt-catalog", headers=admin_headers).json()
    names = {p["name"] for p in cat}
    assert {"clause_polish", "clause_summary"} <= names
    polish = next(p for p in cat if p["name"] == "clause_polish")
    assert "{clause}" in polish["default"] and polish["customized"] is False


def test_versioning_is_name_scoped(client, admin_headers):
    # Seed an extraction prompt version so we can prove isolation.
    client.post("/api/settings/prompts", headers=admin_headers,
                json={"name": "contract_extraction", "content": "EXTRACT {document}", "activate": True})
    # New authoring-prompt version starts at v1 independently.
    r = client.post("/api/settings/prompts", headers=admin_headers,
                    json={"name": "clause_polish", "content": "Polish {clause} of {clause_type}", "activate": True})
    assert r.json()["version"] == 1 and r.json()["name"] == "clause_polish"

    # A second clause_polish version increments only within that name.
    r2 = client.post("/api/settings/prompts", headers=admin_headers,
                     json={"name": "clause_polish", "content": "v2 {clause}", "activate": True})
    assert r2.json()["version"] == 2

    # list is scoped by name
    ext = client.get("/api/settings/prompts?name=contract_extraction", headers=admin_headers).json()
    assert all(p["name"] == "contract_extraction" for p in ext)
    cp = client.get("/api/settings/prompts?name=clause_polish", headers=admin_headers).json()
    assert {p["version"] for p in cp} == {1, 2}
    active = [p for p in cp if p["is_active"]]
    assert len(active) == 1 and active[0]["version"] == 2


def test_render_uses_active_override(client, admin_headers):
    client.post("/api/settings/prompts", headers=admin_headers,
                json={"name": "clause_summary", "content": "SUM {clause_type}: {this_version}", "activate": True})
    from app.database import SessionLocal
    from app.services.prompts import render
    db = SessionLocal()
    try:
        out = render(db, "clause_summary", {"clause_type": "Indemnity",
                     "this_version": "text A", "other_versions": "text B"})
    finally:
        db.close()
    assert out == "SUM Indemnity: text A"
