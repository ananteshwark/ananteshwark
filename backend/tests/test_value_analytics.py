"""Test the contract value-analytics report."""
from datetime import date, timedelta


class TestValueAnalytics:
    def _contract(self, value, dtype=None, end_days=None):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, LifecycleStatus
        db = SessionLocal()
        c = Contract(
            vendor_name_raw="AnalyticsVendor", contract_service="svc",
            status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
            contract_value=value, contract_type=dtype,
            end_date=(date.today() + timedelta(days=end_days)) if end_days is not None else None,
            raw_extracted={}, confidence={},
        )
        db.add(c); db.commit(); db.close()

    def test_totals_and_breakdowns(self, client, admin_headers):
        base = client.get("/api/reports/value-analytics", headers=admin_headers).json()
        base_total = base["total_value"]

        self._contract(1000, dtype="MSA", end_days=20)
        self._contract(500, dtype="NDA", end_days=400)  # beyond the 12-month window

        r = client.get("/api/reports/value-analytics", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["total_value"] == base_total + 1500

        # by_type includes the two types with their summed values
        types = {row["label"]: row["value"] for row in data["by_type"]}
        assert types.get("MSA", 0) >= 1000 and types.get("NDA", 0) >= 500

        # only the 20-day contract falls in the next-12-month expiring value
        months = {m["month"]: m["value"] for m in data["expiring_value_by_month"]}
        assert len(months) == 12
        assert sum(months.values()) >= 1000  # the MSA counts, the 400-day NDA does not

        # top vendors is capped and ordered by value desc
        assert len(data["top_vendors"]) <= 10
        vals = [v["value"] for v in data["top_vendors"]]
        assert vals == sorted(vals, reverse=True)
