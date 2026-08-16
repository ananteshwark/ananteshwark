"""Tests for the auto-incrementing application version."""


def _setup():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.database import Base

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


class TestFormat:
    def test_build_is_zero_padded_to_three_digits(self):
        from app.services.version import format_version
        assert format_version(1, 0, 0) == "1.0.000"
        assert format_version(1, 0, 7) == "1.0.007"
        assert format_version(1, 0, 42) == "1.0.042"
        assert format_version(2, 3, 1234) == "2.3.1234"  # overflow keeps all digits


class TestBuildCounter:
    def test_baseline_then_increments_once_per_new_commit(self, monkeypatch):
        from app.services import version as V

        db = _setup()
        commits = {"c": ("aaaaaaaaaaaa1111", "2026-01-01T00:00:00Z")}
        monkeypatch.setattr(V, "_build_signature", lambda: commits["c"])

        # First run on a fresh DB adopts the current build as the 1.0.000 baseline
        first = V.sync_version(db)
        assert first["version"] == "1.0.000"
        assert first["build"] == 0

        # Re-running with the SAME commit does not bump (e.g. a plain restart)
        again = V.sync_version(db)
        assert again["build"] == 0

        # A different deployed commit = an upgrade -> build ticks up
        commits["c"] = ("bbbbbbbbbbbb2222", "2026-02-02T00:00:00Z")
        upgraded = V.sync_version(db)
        assert upgraded["version"] == "1.0.001"
        assert upgraded["build"] == 1
        assert upgraded["commit"] == "bbbbbbbbbbbb"

        # Yet another upgrade
        commits["c"] = ("cccccccccccc3333", "2026-03-03T00:00:00Z")
        assert V.sync_version(db)["version"] == "1.0.002"

    def test_dev_checkout_never_bumps(self, monkeypatch):
        from app.services import version as V
        db = _setup()
        monkeypatch.setattr(V, "_build_signature", lambda: (None, None))
        assert V.sync_version(db)["version"] == "1.0.000"
        assert V.sync_version(db)["version"] == "1.0.000"


class TestEndpoint:
    def test_version_endpoint_public(self, client):
        r = client.get("/api/version")
        assert r.status_code == 200
        body = r.json()
        assert "version" in body
        # MAJOR.MINOR.BBB shape
        parts = body["version"].split(".")
        assert len(parts) == 3 and len(parts[2]) >= 3

    def test_internal_build_keys_hidden_from_settings(self, client, admin_headers):
        """The build counter is stored in AppSetting but must not leak into the
        admin settings surface (else it trips the 'unknown setting' guard on save)."""
        from app.database import SessionLocal
        from app.services.settings_store import set_setting

        # Simulate what startup does — write the internal build state.
        db = SessionLocal()
        set_setting(db, "app_build_number", "5")
        set_setting(db, "app_build_commit", "deadbeefcafe")
        set_setting(db, "app_build_date", "2026-07-31T00:00:00Z")
        db.commit(); db.close()

        settings = client.get("/api/settings", headers=admin_headers).json()
        assert "app_build_number" not in settings
        assert "app_build_commit" not in settings
        assert "app_build_date" not in settings

        # Saving the full settings object back (as the admin page does) succeeds.
        r = client.put("/api/settings", headers=admin_headers, json={"values": settings})
        assert r.status_code == 200, r.text
