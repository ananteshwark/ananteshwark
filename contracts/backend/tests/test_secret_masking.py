"""API keys and passwords must never leave the server.

settings_store masks SECRET_KEYS on read and ignores the mask sentinel on
write, so a secret can be set but never read back. Nothing asserted it, and it
is the kind of guarantee that quietly stops holding: a new secret setting gets
added to DEFAULTS and forgotten in SECRET_KEYS, or a new endpoint returns the
settings dict unmasked.

These tests assert the property directly — the literal secret value must not
appear anywhere in the response body — rather than asserting that some field
equals the mask, so a leak through a differently-named field or a nested
structure still fails.
"""
import pytest

from app.database import SessionLocal
from app.services.settings_store import MASK, SECRET_KEYS, set_setting

# Distinctive per key, so a failure names which one leaked.
SENTINELS = {key: f"sk-SECRET-{key}-do-not-leak-9f2a" for key in sorted(SECRET_KEYS)}


@pytest.fixture
def secrets_set(client):
    db = SessionLocal()
    previous = {}
    for key, value in SENTINELS.items():
        from app.services.settings_store import get_setting
        previous[key] = get_setting(db, key)
        set_setting(db, key, value)
    db.commit(); db.close()
    yield
    db = SessionLocal()
    for key, value in previous.items():
        set_setting(db, key, value or "")
    db.commit(); db.close()


class TestSecretsNeverReachTheClient:
    def test_the_settings_endpoint_masks_every_secret(self, client, admin_headers, secrets_set):
        r = client.get("/api/settings", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.text
        leaked = [key for key, value in SENTINELS.items() if value in body]
        assert not leaked, f"secret values returned in plain text: {leaked}"

    def test_each_secret_reads_back_as_the_mask(self, client, admin_headers, secrets_set):
        data = client.get("/api/settings", headers=admin_headers).json()
        for key in SENTINELS:
            assert data.get(key) == MASK, f"{key} came back as {data.get(key)!r}, not the mask"

    def test_no_admin_endpoint_echoes_a_secret(self, client, admin_headers, secrets_set):
        """A sweep rather than one endpoint: the masking lives in one helper,
        but any endpoint is free to read the raw setting and return it."""
        paths = [
            "/api/settings",
            "/api/settings/system-status",
            "/api/settings/prompt-catalog",
            "/api/settings/prompts",
            "/api/settings/email-templates",
            "/api/settings/page-access",
            "/api/settings/master-lists",
        ]
        leaks = []
        for path in paths:
            r = client.get(path, headers=admin_headers)
            if r.status_code != 200:
                continue
            for key, value in SENTINELS.items():
                if value in r.text:
                    leaks.append(f"{path} -> {key}")
        assert not leaks, f"secret values echoed by: {leaks}"

    def test_the_audit_log_records_the_mask_not_the_value(self, client, admin_headers, secrets_set):
        """Changing a key writes an audit entry. Recording the old and new
        values verbatim there would put every key ever used in a table any
        admin can read."""
        r = client.get("/api/audit?limit=200", headers=admin_headers)
        assert r.status_code == 200, r.text
        leaked = [key for key, value in SENTINELS.items() if value in r.text]
        assert not leaked, f"secret values written to the audit log: {leaked}"


class TestWritingSecrets:
    def test_saving_the_mask_back_does_not_erase_the_real_value(self, client, admin_headers,
                                                                secrets_set):
        """The client only ever sees the mask, so a plain "save settings" round
        trip sends it back. Treating that as the new value would wipe every
        secret the moment anyone edited an unrelated field."""
        key = "anthropic_api_key"
        assert client.put("/api/settings", json={"values": {key: MASK}},
                          headers=admin_headers).status_code == 200

        from app.services.settings_store import get_setting
        db = SessionLocal()
        stored = get_setting(db, key)
        db.close()
        assert stored == SENTINELS[key], f"{key} was overwritten with the mask"

    def test_a_real_new_value_is_stored(self, client, admin_headers, secrets_set):
        key = "anthropic_api_key"
        assert client.put("/api/settings", json={"values": {key: "sk-a-genuinely-new-value"}},
                          headers=admin_headers).status_code == 200

        from app.services.settings_store import get_setting
        db = SessionLocal()
        stored = get_setting(db, key)
        db.close()
        assert stored == "sk-a-genuinely-new-value"


class TestTheMaskListStaysHonest:
    def test_every_secret_looking_default_is_declared_secret(self):
        """The failure mode this whole file exists for: a new key/password/token
        setting added to DEFAULTS and forgotten in SECRET_KEYS. Named by
        convention, so the convention is what gets checked."""
        from app.services.settings_store import DEFAULTS
        suspicious = {
            k for k in DEFAULTS
            if any(t in k for t in ("api_key", "password", "secret", "private_key",
                                    "credentials", "webhook_url"))
        }
        missed = sorted(suspicious - set(SECRET_KEYS))
        assert not missed, (
            f"these look like secrets but are not in SECRET_KEYS, so they are "
            f"returned in plain text: {missed}")
