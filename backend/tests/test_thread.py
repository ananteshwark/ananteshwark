"""Test the renewal-thread diff endpoint."""
from datetime import date


class TestThread:
    def test_thread_orders_and_flags_changes(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        original = Contract(
            vendor_name_raw="ThreadVendor", contract_service="hosting",
            contract_value=1000, start_date=date(2024, 1, 1), end_date=date(2024, 12, 31),
            status=ContractStatus.VALIDATED, raw_extracted={}, confidence={},
        )
        db.add(original); db.commit()
        original.thread_id = original.sr_no
        renewal = Contract(
            vendor_name_raw="ThreadVendor", contract_service="hosting",
            contract_value=1200, start_date=date(2025, 1, 1), end_date=date(2025, 12, 31),
            status=ContractStatus.VALIDATED, raw_extracted={}, confidence={},
            renews_contract_id=original.sr_no, thread_id=original.sr_no,
        )
        db.add(renewal); db.commit()
        oid, rid = original.sr_no, renewal.sr_no
        db.close()

        r = client.get(f"/api/contracts/{rid}/thread", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["thread_id"] == oid
        assert [v["sr_no"] for v in body["versions"]] == [oid, rid]  # chronological

        # first version has no changes; renewal flags value + dates
        assert body["versions"][0]["changed"] == []
        changed = set(body["versions"][1]["changed"])
        assert "contract_value" in changed
        assert "start_date" in changed and "end_date" in changed
        assert "vendor" not in changed  # same vendor
        # current flag points at the requested contract
        assert body["versions"][1]["is_current"] is True

    def test_singleton_thread(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="Solo", contract_service="s",
                     status=ContractStatus.VALIDATED, raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        body = client.get(f"/api/contracts/{sr}/thread", headers=admin_headers).json()
        assert len(body["versions"]) == 1
        assert body["versions"][0]["changed"] == []
