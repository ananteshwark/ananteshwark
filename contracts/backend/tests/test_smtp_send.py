"""SMTP TLS/AUTH negotiation tests (the fix for 'AUTH extension not supported')."""
from email.mime.text import MIMEText

import pytest


class FakeServer:
    """Records the SMTP call sequence and advertises a configurable feature set
    that can change after STARTTLS (as real servers do)."""
    initial_ext: set = set()
    after_tls_ext: set = set()
    is_ssl = False
    last = None

    def __init__(self, host, port, timeout=None):
        self.host, self.port = host, port
        self.calls = []
        self._ext = set(self.initial_ext)
        type(self).last = self

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def ehlo(self):
        self.calls.append("ehlo")

    def has_extn(self, name):
        return name.lower() in self._ext

    def starttls(self):
        self.calls.append("starttls")
        self._ext |= set(self.after_tls_ext)

    def login(self, user, password):
        self.calls.append(("login", user, password))

    def sendmail(self, frm, to, msg):
        self.calls.append(("sendmail", frm, tuple(to)))


class FakeSSLServer(FakeServer):
    is_ssl = True


def _patch(monkeypatch, initial, after_tls):
    import smtplib
    FakeServer.initial_ext = set(initial)
    FakeServer.after_tls_ext = set(after_tls)
    FakeSSLServer.initial_ext = set(initial)
    FakeSSLServer.last = None
    FakeServer.last = None
    monkeypatch.setattr(smtplib, "SMTP", FakeServer)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSSLServer)


def _cfg(**over):
    base = dict(host="smtp.gmail.com", port=587, user="", password="",
                **{"from": "cms@example.com"}, tls=False)
    base.update(over)
    return base


def _msg():
    m = MIMEText("hi", "html")
    m["Subject"] = "t"
    return m


class TestSmtpSend:
    def test_starttls_upgraded_for_auth_on_587_even_without_tls_toggle(self, monkeypatch):
        # Plaintext session offers STARTTLS but not AUTH; AUTH appears after TLS.
        _patch(monkeypatch, initial={"starttls"}, after_tls={"starttls", "auth"})
        from app.services.notifications import _smtp_send
        _smtp_send(_cfg(user="me@example.com", password="secret", tls=False),
                   ["to@example.com"], _msg())
        calls = FakeServer.last.calls
        assert "starttls" in calls
        assert ("login", "me@example.com", "secret") in calls
        assert any(c[0] == "sendmail" for c in calls if isinstance(c, tuple))

    def test_implicit_ssl_on_465_no_starttls(self, monkeypatch):
        _patch(monkeypatch, initial={"auth"}, after_tls=set())
        from app.services.notifications import _smtp_send
        _smtp_send(_cfg(port=465, user="me@example.com", password="secret"),
                   ["to@example.com"], _msg())
        assert FakeSSLServer.last is not None and FakeSSLServer.last.is_ssl
        assert "starttls" not in FakeSSLServer.last.calls
        assert ("login", "me@example.com", "secret") in FakeSSLServer.last.calls

    def test_no_auth_available_raises_actionable_error(self, monkeypatch):
        # Credentials set but the server never offers AUTH and has no STARTTLS.
        _patch(monkeypatch, initial=set(), after_tls=set())
        from app.services.notifications import _smtp_send
        with pytest.raises(RuntimeError, match="AUTH extension"):
            _smtp_send(_cfg(user="me@example.com", password="secret"),
                       ["to@example.com"], _msg())

    def test_open_relay_without_credentials_skips_login(self, monkeypatch):
        _patch(monkeypatch, initial=set(), after_tls=set())
        from app.services.notifications import _smtp_send
        _smtp_send(_cfg(user=""), ["to@example.com"], _msg())
        calls = FakeServer.last.calls
        assert not any(isinstance(c, tuple) and c[0] == "login" for c in calls)
        assert any(isinstance(c, tuple) and c[0] == "sendmail" for c in calls)
