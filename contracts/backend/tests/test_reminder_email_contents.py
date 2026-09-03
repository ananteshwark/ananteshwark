"""What actually arrives in an expiry reminder.

Three reports from the deployed system meet here:

  * the contract document should come with the reminder;
  * the "Contract document" link opened nothing — it was
    ``contract.contract_link``, an absolute path on the server, which is
    meaningless on the reader's machine;
  * the service summary was missing.

The assertions parse the real MIME message rather than the template string. A
body that renders correctly and a message that carries the file are different
claims, and only the second one is what the recipient gets.
"""
import email
import pathlib

import pytest

from app.models import (
    Contract, ContractRecipient, ContractStatus, EmailTemplate, LifecycleStatus,
    ReminderLog, ReminderRule,
)
from app.services import reminders as R
from app.services.pdf import text_to_pdf


@pytest.fixture
def document(tmp_path):
    path = tmp_path / "master-services-agreement.pdf"
    path.write_bytes(text_to_pdf("MASTER SERVICES AGREEMENT", "The body of the contract.\n" * 30))
    return path


@pytest.fixture
def db():
    from app.database import SessionLocal
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def sent(monkeypatch):
    """Capture the message instead of delivering it, and parse it back.

    Both the transport and the SMTP config are patched in-process. Turning off
    `email_dry_run` in the settings table would work too, but that is global
    state shared with every other test in the run: a test here that dies before
    its teardown would leave the whole suite trying to reach a real relay. This
    way monkeypatch unwinds it whatever happens.
    """
    captured = {}

    def fake_send(cfg, recipients, msg):
        captured["recipients"] = recipients
        captured["message"] = email.message_from_string(msg.as_string())

    monkeypatch.setattr("app.services.notifications._smtp_send", fake_send)
    monkeypatch.setattr("app.services.notifications._smtp_config", lambda: {
        "host": "localhost", "port": 25, "user": "", "password": "",
        "from": "cms@example.com", "tls": False, "dry_run": False,
    })
    return captured


def _setting(key: str, value: str) -> None:
    """Write one setting on its own session.

    The test's own session may be mid-failure by the time a teardown needs to
    restore a setting, and committing a poisoned session raises — which is how
    a leaked setting escapes into the rest of the run.
    """
    from app.database import SessionLocal
    from app.services.settings_store import set_setting
    session = SessionLocal()
    try:
        set_setting(session, key, value)
        session.commit()
    finally:
        session.close()


def _reminder(db, document=None, **kw):
    """A validated contract, 30 days out, with one recipient and an email rule."""
    rule = ReminderRule(name=f"rule-{id(kw)}", offsets=[30], channels=["email"])
    db.add(rule)
    db.flush()
    from datetime import date, timedelta
    contract = Contract(
        vendor_name_raw="Acme Ltd", contract_service="Managed services",
        status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
        end_date=date.today() + timedelta(days=30),
        contract_link=str(document) if document else None,
        reminder_rule_id=rule.id, raw_extracted={}, confidence={}, **kw,
    )
    db.add(contract)
    db.flush()
    db.add(ContractRecipient(contract_id=contract.sr_no, name="Owner",
                             email="owner@example.com", is_primary=True))
    db.commit()
    return contract, rule


def _parts(message):
    return list(message.walk())


def _html(message):
    return [p for p in _parts(message)
            if p.get_content_type() == "text/html"][0].get_payload(decode=True).decode()


def _files(message):
    return [(p.get_filename(), p.get_content_type(), p.get_payload(decode=True))
            for p in _parts(message) if p.get_filename()]


@pytest.fixture(autouse=True)
def attach_defaults(client):
    """Start every test from the shipped attachment settings, and put them back
    afterwards — several tests here change them, and they are global."""
    _setting("reminder_attach_document", "true")
    _setting("reminder_attach_max_mb", "10")
    yield
    _setting("reminder_attach_document", "true")
    _setting("reminder_attach_max_mb", "10")


class TestTheDocumentIsAttached:
    def test_the_file_rides_along(self, db, sent, document):
        contract, rule = _reminder(db, document)
        R.send_contract_reminder(db, contract, rule, 30)
        files = _files(sent["message"])
        assert [f[0] for f in files] == ["master-services-agreement.pdf"]

    def test_the_bytes_are_the_contract_not_a_placeholder(self, db, sent, document):
        """The attachment has to survive base64 intact — an email carrying a
        corrupted contract is worse than one carrying none."""
        contract, rule = _reminder(db, document)
        R.send_contract_reminder(db, contract, rule, 30)
        assert _files(sent["message"])[0][2] == document.read_bytes()

    def test_a_pdf_is_labelled_a_pdf(self, db, sent, document):
        contract, rule = _reminder(db, document)
        R.send_contract_reminder(db, contract, rule, 30)
        assert _files(sent["message"])[0][1] == "application/pdf"

    def test_the_body_still_renders_beside_it(self, db, sent, document):
        """Attaching a file must not turn the message into a bare attachment."""
        contract, rule = _reminder(db, document)
        R.send_contract_reminder(db, contract, rule, 30)
        assert sent["message"].get_content_type() == "multipart/mixed"
        assert "approaching expiry" in _html(sent["message"])

    def test_the_body_says_the_document_is_attached(self, db, sent, document):
        contract, rule = _reminder(db, document)
        R.send_contract_reminder(db, contract, rule, 30)
        assert "attached to this email" in _html(sent["message"])

    def test_the_reminder_log_records_it(self, db, sent, document):
        """"Was the contract reminded" and "did they get the contract" are
        different questions, and only the log can answer the second one later."""
        contract, rule = _reminder(db, document)
        R.send_contract_reminder(db, contract, rule, 30)
        db.commit()
        row = (db.query(ReminderLog)
               .filter(ReminderLog.contract_id == contract.sr_no).first())
        assert "document attached" in (row.detail or "")


class TestWhenItCannotBeAttached:
    """A reminder that cannot carry the document must still be sent, and must
    say so — a recipient told to see an attachment that is not there is worse
    off than one told there is none."""

    def test_a_missing_file_does_not_stop_the_reminder(self, db, sent, tmp_path):
        contract, rule = _reminder(db, tmp_path / "gone.pdf")
        R.send_contract_reminder(db, contract, rule, 30)
        assert _files(sent["message"]) == []
        assert "missing from the server" in _html(sent["message"])

    def test_a_contract_with_no_document_says_so(self, db, sent):
        contract, rule = _reminder(db, None)
        R.send_contract_reminder(db, contract, rule, 30)
        assert "no document is on file" in _html(sent["message"])

    def test_an_oversized_document_is_skipped_with_its_size(self, db, sent, document):
        """Relays refuse large messages outright, so an over-limit attachment
        would cost the whole reminder, not just the file."""
        _setting("reminder_attach_max_mb", "0.0001")
        contract, rule = _reminder(db, document)
        R.send_contract_reminder(db, contract, rule, 30)
        body = _html(sent["message"])
        assert _files(sent["message"]) == []
        assert "MB limit" in body

    def test_the_setting_switches_attachments_off(self, db, sent, document):
        _setting("reminder_attach_document", "false")
        contract, rule = _reminder(db, document)
        R.send_contract_reminder(db, contract, rule, 30)
        assert _files(sent["message"]) == []
        # Off is a choice, not a fault — no apologetic note.
        assert "could not be attached" not in _html(sent["message"])
        assert sent["message"].get_content_type() == "text/html"


class TestTheDeadLink:
    def test_the_server_path_never_reaches_the_reader(self, db, sent, document):
        """The reported bug: the link was the file's path on the server."""
        contract, rule = _reminder(db, document)
        R.send_contract_reminder(db, contract, rule, 30)
        assert str(document) not in _html(sent["message"])

    def test_a_customised_template_stops_emitting_it_too(self, db, sent, document):
        """Templates live in the database, where changing this module's default
        does not reach them."""
        db.add(EmailTemplate(
            name="expiry_reminder", subject="[CMS] {vendor}",
            body='<p><a href="{document_link}">Contract document</a></p>'))
        db.commit()
        try:
            contract, rule = _reminder(db, document)
            R.send_contract_reminder(db, contract, rule, 30)
            body = _html(sent["message"])
            assert str(document) not in body
            # The wording survives; only the unusable destination is gone.
            assert "Contract document" in body
        finally:
            db.query(EmailTemplate).filter(EmailTemplate.name == "expiry_reminder").delete()
            db.commit()

    @pytest.mark.parametrize("href,survives", [
        ("/opt/cms/watched/deal.pdf", False),      # a path on the server
        ("file:///srv/deal.pdf", False),           # explicitly a local file
        ("/contracts/7", False),                   # no base URL once it leaves the browser
        ("http://cms.example.com/contracts/7", True),
        ("https://cms.example.com/contracts/7", True),
        ("mailto:legal@example.com", True),
    ])
    def test_only_links_the_reader_can_open_survive(self, href, survives):
        html = f'<p><a href="{href}">Open</a></p>'
        out = R.strip_dead_links(html)
        assert (href in out) is survives, out
        assert "Open" in out, "the link text must survive either way"


class TestTheServiceSummary:
    def test_it_appears_in_the_reminder(self, db, sent, document):
        contract, rule = _reminder(
            db, document,
            service_summary="Round-the-clock support for the claims platform.")
        R.send_contract_reminder(db, contract, rule, 30)
        assert "claims platform" in _html(sent["message"])

    def test_it_is_offered_to_admins_editing_the_template(self, client, admin_headers):
        r = client.get("/api/settings/email-templates", headers=admin_headers)
        assert r.status_code == 200, r.text
        expiry = [t for t in r.json() if t["name"] == "expiry_reminder"][0]
        assert "service_summary" in expiry["placeholders"]
        # And the placeholder that produced an unopenable link is not offered.
        assert "document_link" not in expiry["placeholders"]

    def test_a_contract_without_one_still_sends(self, db, sent, document):
        contract, rule = _reminder(db, document, service_summary=None)
        R.send_contract_reminder(db, contract, rule, 30)
        assert "approaching expiry" in _html(sent["message"])


class TestAcknowledgement:
    """The button reported as "not functional". The endpoint always worked; what
    was missing was any way to see that it had, or to undo it."""

    def test_acknowledging_stops_the_reminders(self, client, admin_headers, db, document):
        contract, _rule = _reminder(db, document)
        r = client.post(f"/api/contracts/{contract.sr_no}/acknowledge-reminders",
                        headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json()["reminders_acknowledged"] is True
        schedule = client.get(f"/api/contracts/{contract.sr_no}/reminder-schedule",
                              headers=admin_headers).json()
        assert schedule["stopped"] and schedule["stopped_reason"] == "acknowledged"

    def test_it_can_be_undone(self, client, admin_headers, db, document):
        """Nothing cleared this flag before: a mis-click silenced a contract's
        expiry reminders permanently."""
        contract, _rule = _reminder(db, document)
        client.post(f"/api/contracts/{contract.sr_no}/acknowledge-reminders",
                    headers=admin_headers)
        r = client.post(
            f"/api/contracts/{contract.sr_no}/acknowledge-reminders?acknowledged=false",
            headers=admin_headers)
        assert r.status_code == 200, r.text
        assert r.json()["reminders_acknowledged"] is False
        schedule = client.get(f"/api/contracts/{contract.sr_no}/reminder-schedule",
                              headers=admin_headers).json()
        assert not schedule["stopped"]

    def test_the_state_is_readable_from_the_record(self, client, admin_headers, db, document):
        """The page needs this to label the button and show the badge; without
        it the UI cannot tell acknowledged from not."""
        contract, _rule = _reminder(db, document)
        detail = client.get(f"/api/contracts/{contract.sr_no}", headers=admin_headers).json()
        assert detail["reminders_acknowledged"] is False

    def test_both_directions_are_audited(self, client, admin_headers, db, document):
        contract, _rule = _reminder(db, document)
        client.post(f"/api/contracts/{contract.sr_no}/acknowledge-reminders",
                    headers=admin_headers)
        client.post(f"/api/contracts/{contract.sr_no}/acknowledge-reminders?acknowledged=false",
                    headers=admin_headers)
        audit = client.get(f"/api/contracts/{contract.sr_no}/audit", headers=admin_headers).json()
        actions = [row["action"] for row in audit]
        assert "ACK_REMINDERS" in actions and "RESUME_REMINDERS" in actions

    def test_a_viewer_may_not_acknowledge(self, client, db, document):
        from app.auth import hash_password
        from app.database import SessionLocal
        from app.models import User, UserRole
        from tests.conftest import _token
        session = SessionLocal()
        if not session.query(User).filter(User.email == "ack-viewer@example.com").first():
            session.add(User(email="ack-viewer@example.com", name="V", role=UserRole.VIEWER,
                             hashed_password=hash_password("viewerpass123")))
            session.commit()
        session.close()
        contract, _rule = _reminder(db, document)
        headers = {"Authorization":
                   f"Bearer {_token(client, 'ack-viewer@example.com', 'viewerpass123')}"}
        r = client.post(f"/api/contracts/{contract.sr_no}/acknowledge-reminders", headers=headers)
        assert r.status_code == 403


def test_the_document_path_is_never_in_the_body_even_when_attached(db, sent, tmp_path):
    """Belt and braces on the reported defect: whatever else changes, the
    server's own filesystem layout must not travel to a recipient."""
    doc = tmp_path / "deal.pdf"
    doc.write_bytes(text_to_pdf("T", "body"))
    contract, rule = _reminder(db, doc)
    R.send_contract_reminder(db, contract, rule, 30)
    body = _html(sent["message"])
    assert str(tmp_path) not in body
    assert str(pathlib.Path(doc).parent) not in body
