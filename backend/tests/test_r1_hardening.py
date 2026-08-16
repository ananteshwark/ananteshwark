"""R1 hardening: multi-signer anchors, webhook HMAC, OTP email/lockout,
rate limiting, optimistic-concurrency autosave."""
import base64
import hashlib
import hmac
import types
import uuid


class TestMultiSignerAnchors:
    def test_anchor_per_signer(self):
        from app.services.esign import build_final_pdf
        draft = types.SimpleNamespace(
            title="Deal", fields={},
            document={"type": "doc", "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "Body."}]}]})
        signers = [
            {"name": "A", "anchor": "/sig1/", "date_anchor": "/date1/"},
            {"name": "B", "anchor": "/sig2/", "date_anchor": "/date2/"},
            {"name": "C", "anchor": "/sig3/", "date_anchor": "/date3/"},
        ]
        pdf = build_final_pdf(draft, signers)
        assert b"/sig3/" in pdf and b"/date3/" in pdf     # third signer's tab exists


class TestWebhookVerification:
    def test_verify_rules(self, client, admin_headers):
        from app.database import SessionLocal
        from app.services import esign as ES
        from app.services.settings_store import set_setting
        db = SessionLocal()
        body = b'{"event":"x"}'
        # mock provider -> always accepted
        set_setting(db, "esign_provider", "mock"); db.commit()
        assert ES.verify_webhook(db, body, {}) is True
        # docusign + secret -> must match HMAC
        set_setting(db, "esign_provider", "docusign")
        set_setting(db, "docusign_webhook_secret", "s3cr3t"); db.commit()
        good = base64.b64encode(hmac.new(b"s3cr3t", body, hashlib.sha256).digest()).decode()
        assert ES.verify_webhook(db, body, {"x-docusign-signature-1": good}) is True
        assert ES.verify_webhook(db, body, {"x-docusign-signature-1": "wrong"}) is False
        assert ES.verify_webhook(db, body, {}) is False
        # reset
        set_setting(db, "esign_provider", "mock"); db.commit(); db.close()


def _shared_link(client, admin_headers, otp=False):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    r = client.post(f"/api/authoring/drafts/{d['id']}/share", headers=admin_headers, json={
        "recipients": [{"email": "v@x.com", "name": "V"}], "require_otp": otp})
    return d, r.json()["links"][0]


class TestOtp:
    def test_resend_endpoint(self, client, admin_headers):
        _d, link = _shared_link(client, admin_headers, otp=True)
        r = client.post(f"/api/vendor/{link['token']}/resend-otp")
        assert r.status_code == 200 and "sent" in r.json()

    def test_lockout_after_failures(self, client, admin_headers):
        _d, link = _shared_link(client, admin_headers, otp=True)
        tok = link["token"]
        for _ in range(5):
            client.post(f"/api/vendor/{tok}/verify-otp", json={"code": "000000"})
        # link is now revoked -> opening is blocked
        assert client.get(f"/api/vendor/{tok}").status_code == 403


class TestRateLimit:
    def test_allow_window(self):
        from app.services.rate_limit import allow
        key = f"k-{uuid.uuid4().hex}"
        assert all(allow(key, 3, 60) for _ in range(3))
        assert allow(key, 3, 60) is False   # 4th within window rejected


class TestOptimisticConcurrency:
    def test_stale_base_rev_rejected(self, client, admin_headers):
        d = client.post("/api/authoring/drafts", headers=admin_headers,
                        json={"origin": "scratch", "contract_type": "MSA"}).json()
        did = d["id"]
        r1 = client.put(f"/api/authoring/drafts/{did}", headers=admin_headers,
                        json={"fields": {"vendor": "One"}, "base_rev": d["rev"]})
        assert r1.status_code == 200
        new_rev = r1.json()["rev"]
        assert new_rev == d["rev"] + 1
        # a save based on the OLD rev is now stale -> 409
        stale = client.put(f"/api/authoring/drafts/{did}", headers=admin_headers,
                           json={"fields": {"vendor": "Two"}, "base_rev": d["rev"]})
        assert stale.status_code == 409
        # a save with the CURRENT rev succeeds
        ok = client.put(f"/api/authoring/drafts/{did}", headers=admin_headers,
                        json={"fields": {"vendor": "Two"}, "base_rev": new_rev})
        assert ok.status_code == 200
