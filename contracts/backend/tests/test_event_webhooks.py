"""Tests for outbound contract-event webhooks."""
from datetime import date

from app.services import event_webhooks
from app.services.event_webhooks import EVENT_TYPES, build_event, sign_payload


def test_sign_payload_is_hmac_sha256():
    sig = sign_payload("secret", b"{}")
    assert sig.startswith("sha256=")
    # deterministic for the same input
    assert sig == sign_payload("secret", b"{}")
    assert sig != sign_payload("other", b"{}")


def test_build_event_shape():
    class C:
        sr_no = 5
        vendor = None
        vendor_name_raw = "Acme"
        signing_entity = "Us"
        contract_type = "MSA"
        department = None
        po_number = "PO1"
        contract_value = 1000
        currency = "INR"
        start_date = date(2025, 1, 1)
        end_date = date(2025, 12, 31)

        class _S:
            value = "VALIDATED"

        class _L:
            value = "ACTIVE"
        status = _S()
        lifecycle_status = _L()

    ev = build_event("contract.validated", C())
    assert ev["event"] == "contract.validated"
    assert ev["data"]["sr_no"] == 5 and ev["data"]["vendor"] == "Acme"
    assert ev["data"]["contract_value"] == 1000.0
    assert ev["data"]["end_date"] == "2025-12-31"


class TestEmitAndWiring:
    def _capture(self, monkeypatch):
        calls = []
        monkeypatch.setattr(event_webhooks, "_deliver",
                            lambda url, secret, event: calls.append((url, secret, event)))
        return calls

    def test_disabled_emits_nothing(self, client, admin_headers, monkeypatch):
        calls = self._capture(monkeypatch)
        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"event_webhook_enabled": "false",
                                    "event_webhook_url": "https://x.example.com/h"}})
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="V", contract_service="s", status=ContractStatus.VALIDATED,
                     raw_extracted={}, confidence={})
        db.add(c); db.commit()
        event_webhooks.emit_event(db, "contract.validated", c)
        db.close()
        assert calls == []

    def test_validate_fires_event_when_enabled(self, client, admin_headers, monkeypatch):
        calls = self._capture(monkeypatch)
        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"event_webhook_enabled": "true",
                                    "event_webhook_url": "https://x.example.com/h",
                                    "event_webhook_events": ""}})
        # a complete contract that can validate
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, Department, InternalEntity
        db = SessionLocal()
        dept = Department(name="HookDept")
        db.add(dept)
        if not db.query(InternalEntity).filter(InternalEntity.name == "Us").first():
            db.add(InternalEntity(name="Us", aliases=[]))  # predefined so validation passes
        db.commit()
        c = Contract(vendor_name_raw="HookVendor", signing_entity="Us", contract_service="svc",
                     po_number="PO9", department_id=dept.id, start_date=date(2025, 1, 1),
                     end_date=date(2025, 12, 31), contract_value=100,
                     status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()

        r = client.post(f"/api/contracts/{sr}/validate", headers=admin_headers, json={"force": True})
        assert r.status_code == 200, r.text
        assert any(ev["event"] == "contract.validated" and ev["data"]["sr_no"] == sr
                   for _, _, ev in calls)

        # clean up the enabled flag so later tests don't POST for real
        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"event_webhook_enabled": "false", "event_webhook_url": ""}})

    def test_event_subscription_filter(self, client, admin_headers, monkeypatch):
        calls = self._capture(monkeypatch)
        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"event_webhook_enabled": "true",
                                    "event_webhook_url": "https://x.example.com/h",
                                    "event_webhook_events": "contract.terminated"}})
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="V2", contract_service="s", status=ContractStatus.VALIDATED,
                     raw_extracted={}, confidence={})
        db.add(c); db.commit()
        event_webhooks.emit_event(db, "contract.validated", c)  # not subscribed
        event_webhooks.emit_event(db, "contract.terminated", c)  # subscribed
        db.close()
        events = [ev["event"] for _, _, ev in calls]
        assert "contract.terminated" in events and "contract.validated" not in events
        client.put("/api/settings", headers=admin_headers,
                   json={"values": {"event_webhook_enabled": "false", "event_webhook_url": ""}})

    def test_all_event_types_known(self):
        assert EVENT_TYPES == {"contract.validated", "contract.rejected",
                               "contract.renewed", "contract.terminated"}
