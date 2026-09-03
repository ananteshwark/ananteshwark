"""R3 2.7: DocuSign delivery options (reminders/expiration/template) + correct."""
from tests.test_esign import _draft, _signers


def test_send_stores_options_and_correct_updates(client, admin_headers):
    d = _draft(client, admin_headers)
    payload = {**_signers(), "reminder_enabled": True, "reminder_frequency_days": 2,
               "expire_days": 21, "template_id": "tmpl-123"}
    env = client.post(f"/api/esign/drafts/{d['id']}/send", headers=admin_headers, json=payload).json()
    assert env["options"]["expire_days"] == 21
    assert env["options"]["reminder_frequency_days"] == 2
    assert env["options"]["template_id"] == "tmpl-123"

    # correct the in-flight envelope
    r = client.post(f"/api/esign/envelopes/{env['id']}/correct", headers=admin_headers,
                    json={"expire_days": 45, "reminder_enabled": False})
    assert r.status_code == 200
    opts = r.json()["options"]
    assert opts["expire_days"] == 45 and opts["reminder_enabled"] is False
    assert any(ev["event_type"] == "corrected" for ev in r.json()["events"])


def test_docusign_notification_builder():
    from app.services.esign import DocuSignProvider
    n = DocuSignProvider._notification({"reminder_enabled": True, "reminder_delay_days": 1,
                                        "reminder_frequency_days": 4, "expire_days": 30})
    assert n["reminders"]["reminderEnabled"] == "true"
    assert n["reminders"]["reminderFrequency"] == "4"
    assert n["expirations"]["expireAfter"] == "30"


def test_correct_rejected_after_completion(client, admin_headers):
    d = _draft(client, admin_headers)
    env = client.post(f"/api/esign/drafts/{d['id']}/send", headers=admin_headers, json=_signers()).json()
    client.post("/api/esign/webhook", json={"envelope_id": env["external_id"], "status": "completed"})
    r = client.post(f"/api/esign/envelopes/{env['id']}/correct", headers=admin_headers,
                    json={"expire_days": 10})
    assert r.status_code == 409
