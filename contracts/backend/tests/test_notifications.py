"""Tests for Slack/Teams webhook notification channels."""
from app.services import notifications
from app.services.notifications import _html_to_text, get_channel


def test_html_to_text_strips_markup_and_bullets():
    html = "<p>Hello</p><ul><li>one</li><li>two</li></ul><p>bye</p>"
    text = _html_to_text(html)
    assert "Hello" in text and "• one" in text and "• two" in text and "bye" in text
    assert "<" not in text


class TestChatChannels:
    def _capture(self, monkeypatch):
        calls = []
        monkeypatch.setattr(notifications, "_post_json", lambda url, payload: calls.append((url, payload)))
        return calls

    def test_slack_posts_text_when_configured(self, client, admin_headers, monkeypatch):
        calls = self._capture(monkeypatch)
        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"slack_webhook_url": "https://hooks.slack.com/services/x"}})
        get_channel("slack").send([], "Subject here", "<p>Body text</p>")
        assert len(calls) == 1
        url, payload = calls[0]
        assert url.endswith("/x")
        assert "Subject here" in payload["text"] and "Body text" in payload["text"]

    def test_teams_uses_messagecard(self, client, admin_headers, monkeypatch):
        calls = self._capture(monkeypatch)
        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"teams_webhook_url": "https://outlook.office.com/webhook/y"}})
        get_channel("teams").send([], "T subject", "<p>hi</p>")
        assert len(calls) == 1
        _, payload = calls[0]
        assert payload["@type"] == "MessageCard"
        assert payload["title"] == "T subject" and "hi" in payload["text"]

    def test_no_webhook_skips_silently(self, client, admin_headers, monkeypatch):
        calls = self._capture(monkeypatch)
        # ensure slack url is cleared
        client.put("/api/settings", headers=admin_headers, json={"values": {"slack_webhook_url": ""}})
        get_channel("slack").send([], "s", "<p>b</p>")
        assert calls == []

    def test_notify_test_endpoint_requires_configured_url(self, client, admin_headers, monkeypatch):
        self._capture(monkeypatch)
        client.put("/api/settings", headers=admin_headers, json={"values": {"teams_webhook_url": ""}})
        r = client.post("/api/settings/notify-test?channel=teams", headers=admin_headers)
        assert r.status_code == 400
        # invalid channel name
        assert client.post("/api/settings/notify-test?channel=sms", headers=admin_headers).status_code == 400
