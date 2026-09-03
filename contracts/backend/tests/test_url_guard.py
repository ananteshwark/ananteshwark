"""SSRF guard for operator-configured webhook URLs."""
import pytest

from app.services.url_guard import UnsafeUrlError, assert_safe_outbound_url


@pytest.mark.parametrize(
    "url",
    [
        "http://169.254.169.254/latest/meta-data/",  # cloud instance metadata
        "http://127.0.0.1:8000/api/health",          # loopback
        "http://localhost:8000/",                    # loopback by name
        "http://10.0.0.5/hook",                      # RFC1918
        "http://192.168.1.10/hook",
        "http://172.16.0.9/hook",
        "http://[::1]/hook",                         # IPv6 loopback
        "http://0.0.0.0/",                           # unspecified
    ],
)
def test_internal_targets_are_refused(url):
    with pytest.raises(UnsafeUrlError):
        assert_safe_outbound_url(url)


@pytest.mark.parametrize(
    "url",
    ["file:///etc/passwd", "gopher://x/", "ftp://example.com/x", "", "https://", "not-a-url"],
)
def test_non_http_schemes_and_hostless_urls_are_refused(url):
    with pytest.raises(UnsafeUrlError):
        assert_safe_outbound_url(url)


def test_unresolvable_host_is_refused():
    with pytest.raises(UnsafeUrlError):
        assert_safe_outbound_url("https://this-host-should-not-resolve.invalid/hook")


def test_public_target_is_allowed(monkeypatch):
    # Pin resolution so the test does not depend on network/DNS.
    monkeypatch.setattr(
        "app.services.url_guard.resolved_addresses", lambda host, port: ["93.184.216.34"]
    )
    url = "https://hooks.example.com/endpoint"
    assert assert_safe_outbound_url(url) == url


def test_mixed_resolution_is_refused(monkeypatch):
    # A name answering with one public and one internal address must not pass:
    # the request could land on the internal one.
    monkeypatch.setattr(
        "app.services.url_guard.resolved_addresses",
        lambda host, port: ["93.184.216.34", "169.254.169.254"],
    )
    with pytest.raises(UnsafeUrlError):
        assert_safe_outbound_url("https://rebind.example.com/hook")
