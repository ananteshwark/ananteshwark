"""The app must refuse to start on a configuration that cannot be secure.

JWT_SECRET used to default to "change-me-in-production". A default signing key
is not a weak secret, it is a published one: anyone able to read the repository
could mint a token for any user id and role, including SUPER_ADMIN, and the app
would accept it. Nothing detected the missing variable — it booted normally and
authenticated nobody.
"""
import pytest

from app.config import Settings


PROD_URL = "https://vendorcontracts.example.com"


def _settings(**overrides):
    s = Settings()
    s.APP_BASE_URL = PROD_URL
    for k, v in overrides.items():
        setattr(s, k, v)
    return s


class TestJwtSecretIsMandatory:
    GOOD = "0123456789abcdef0123456789abcdef0123456789abcdef"

    def test_a_real_secret_passes(self):
        _settings(JWT_SECRET=self.GOOD, ENV="production").validate()

    def test_an_unset_secret_refuses_to_start(self):
        with pytest.raises(RuntimeError, match="JWT_SECRET is not set"):
            _settings(JWT_SECRET="", ENV="production").validate()

    @pytest.mark.parametrize("placeholder", [
        "change-me-in-production",
        "changeme",
        "secret",
        "your-secret-key",
        "please-change-me-to-a-long-random-string-32b+",
    ])
    def test_known_placeholders_are_refused(self, placeholder):
        """Including the one .env.example shipped, which people copy verbatim —
        it is long enough to pass a length check and completely public."""
        with pytest.raises(RuntimeError, match="placeholder"):
            _settings(JWT_SECRET=placeholder, ENV="production").validate()

    def test_a_short_secret_is_refused_in_production(self):
        with pytest.raises(RuntimeError, match="at least 32"):
            _settings(JWT_SECRET="tooshort", ENV="production").validate()

    def test_a_short_secret_is_tolerated_in_development(self):
        _settings(JWT_SECRET="devkey", ENV="development").validate()

    def test_development_still_requires_something(self):
        with pytest.raises(RuntimeError, match="JWT_SECRET is not set"):
            _settings(JWT_SECRET="", ENV="development").validate()

    def test_the_error_names_every_problem_at_once(self):
        """One restart should reveal the whole list, not the first item."""
        with pytest.raises(RuntimeError) as exc:
            _settings(JWT_SECRET="", ENV="production").validate()
        assert "openssl rand -hex 32" in str(exc.value)


class TestEnvironmentFlag:
    def test_anything_other_than_development_is_production(self):
        assert not _settings(ENV="production").is_development
        assert not _settings(ENV="").is_development
        assert not _settings(ENV="prod").is_development
        assert not _settings(ENV="staging").is_development

    def test_development_is_recognised_case_insensitively(self):
        assert Settings.ENV is not None
        s = _settings(ENV="development")
        assert s.is_development


class TestCorsOrigins:
    """The Vite dev origin used to be trusted unconditionally, in production,
    with credentials — so anything an authenticated user could be induced to
    load on localhost:5173 could read authenticated responses."""

    def test_dev_origin_is_absent_in_production(self, monkeypatch):
        from app import main
        monkeypatch.setattr(main.settings, "ENV", "production")
        monkeypatch.setattr(main.settings, "APP_BASE_URL", PROD_URL)
        assert "http://localhost:5173" not in main._cors_origins()

    def test_dev_origin_is_present_in_development(self, monkeypatch):
        from app import main
        monkeypatch.setattr(main.settings, "ENV", "development")
        monkeypatch.setattr(main.settings, "APP_BASE_URL", PROD_URL)
        assert "http://localhost:5173" in main._cors_origins()

    def test_the_app_base_url_is_always_allowed(self, monkeypatch):
        from app import main
        monkeypatch.setattr(main.settings, "ENV", "production")
        monkeypatch.setattr(main.settings, "APP_BASE_URL", PROD_URL)
        assert PROD_URL in main._cors_origins()


class TestAppBaseUrlMustBeReal:
    """APP_BASE_URL is the CORS allow-list entry, the host in every reminder and
    review email, and the base of the no-login renew/terminate links. Left at
    the dev default in production, all of those point at the reader's own
    machine."""

    GOOD = "0123456789abcdef0123456789abcdef0123456789abcdef"

    def test_the_dev_default_is_refused_in_production(self):
        with pytest.raises(RuntimeError, match="APP_BASE_URL"):
            s = _settings(JWT_SECRET=self.GOOD, ENV="production")
            s.APP_BASE_URL = "http://localhost:5173"
            s.validate()

    def test_the_dev_default_is_fine_in_development(self):
        s = _settings(JWT_SECRET=self.GOOD, ENV="development")
        s.APP_BASE_URL = "http://localhost:5173"
        s.validate()

    def test_a_real_url_passes(self):
        _settings(JWT_SECRET=self.GOOD, ENV="production").validate()
