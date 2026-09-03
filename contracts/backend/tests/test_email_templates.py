"""R2 1.10: admin-editable notification templates."""


def test_catalog_lists_defaults(client, admin_headers):
    rows = client.get("/api/settings/email-templates", headers=admin_headers).json()
    names = {r["name"] for r in rows}
    # every notification kind is surfaced, even before customization
    assert {"approval_request", "vendor_disposition", "vendor_otp", "expiry_reminder"} <= names
    appr = next(r for r in rows if r["name"] == "approval_request")
    assert appr["customized"] is False
    assert "{gate}" in appr["subject"]
    assert "gate" in appr["placeholders"]


def test_override_and_reset(client, admin_headers):
    # override
    client.put("/api/settings/email-templates/approval_request", headers=admin_headers,
               json={"subject": "CUSTOM {gate}", "body": "<p>{message}</p>"})
    rows = client.get("/api/settings/email-templates", headers=admin_headers).json()
    appr = next(r for r in rows if r["name"] == "approval_request")
    assert appr["subject"] == "CUSTOM {gate}" and appr["customized"] is True
    # reset back to the built-in default
    assert client.delete("/api/settings/email-templates/approval_request", headers=admin_headers).status_code == 200
    rows = client.get("/api/settings/email-templates", headers=admin_headers).json()
    appr = next(r for r in rows if r["name"] == "approval_request")
    assert appr["customized"] is False and appr["subject"] == appr["default_subject"]


def test_render_named_applies_override(client, admin_headers):
    from app.database import SessionLocal
    from app.services.email_templates import render_named
    client.put("/api/settings/email-templates/vendor_disposition", headers=admin_headers,
               json={"subject": "Re: your changes", "body": "Hi {vendor_email} {summary_html}"})
    db = SessionLocal()
    try:
        subject, body = render_named(db, "vendor_disposition",
                                     {"vendor_email": "v@x.com", "summary_html": "<ul></ul>", "url": "http://x"})
    finally:
        db.close()
    assert subject == "Re: your changes"
    assert "v@x.com" in body and "<ul></ul>" in body


def test_requires_admin(client, admin_headers):
    client.post("/api/auth/users", headers=admin_headers,
                json={"email": "viewer_tpl@example.com", "name": "V", "password": "viewer12345", "role": "VIEWER"})
    token = client.post("/api/auth/login",
                        json={"email": "viewer_tpl@example.com", "password": "viewer12345"}).json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/settings/email-templates", headers=h).status_code == 403
