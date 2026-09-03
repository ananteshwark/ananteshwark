from app.services.google_auth import decide_google_access


class TestDecideGoogleAccess:
    def test_unverified_email_denied(self):
        d, _ = decide_google_access("a@x.com", False, True, allowed_domain="", auto_provision=False)
        assert d == "deny"

    def test_missing_email_denied(self):
        d, _ = decide_google_access("", True, False, allowed_domain="", auto_provision=False)
        assert d == "deny"

    def test_existing_user_allowed(self):
        d, _ = decide_google_access("a@x.com", True, True, allowed_domain="", auto_provision=False)
        assert d == "allow"

    def test_unknown_user_denied_without_provision(self):
        d, reason = decide_google_access("a@x.com", True, False, allowed_domain="", auto_provision=False)
        assert d == "deny"
        assert "administrator" in reason

    def test_domain_restriction_blocks_other_domains(self):
        d, _ = decide_google_access(
            "a@other.com", True, True, allowed_domain="example.com", auto_provision=True
        )
        assert d == "deny"

    def test_existing_user_in_allowed_domain(self):
        d, _ = decide_google_access(
            "a@example.com", True, True, allowed_domain="example.com", auto_provision=False
        )
        assert d == "allow"

    def test_provision_new_user_in_allowed_domain(self):
        d, _ = decide_google_access(
            "new@example.com", True, False, allowed_domain="example.com", auto_provision=True
        )
        assert d == "provision"

    def test_no_provision_without_allowed_domain_even_if_enabled(self):
        # Auto-provision without a domain guard would let any Google account in
        d, _ = decide_google_access("new@x.com", True, False, allowed_domain="", auto_provision=True)
        assert d == "deny"

    def test_allowed_domain_accepts_leading_at_and_case(self):
        d, _ = decide_google_access(
            "a@Example.COM", True, True, allowed_domain="@example.com", auto_provision=False
        )
        assert d == "allow"
