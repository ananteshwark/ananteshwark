"""Test the vendor concentration / dependency-risk report."""


class TestVendorConcentration:
    def _vendor_with_value(self, client, admin_headers, name, value):
        v = client.post("/api/vendors", headers=admin_headers, json={"name": name}).json()
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus, LifecycleStatus
        db = SessionLocal()
        db.add(Contract(vendor_id=v["id"], vendor_name_raw=name, contract_service="svc",
                        contract_value=value, status=ContractStatus.VALIDATED,
                        lifecycle_status=LifecycleStatus.ACTIVE, raw_extracted={}, confidence={}))
        db.commit(); db.close()
        return v["id"]

    def test_shares_hhi_and_threshold_flag(self, client, admin_headers):
        # dominant vendor 800, two small 100 each
        big = self._vendor_with_value(client, admin_headers, "BigCo", 800)
        self._vendor_with_value(client, admin_headers, "SmallA", 100)
        self._vendor_with_value(client, admin_headers, "SmallB", 100)

        r = client.get("/api/reports/vendor-concentration?threshold=0.2", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()

        by_id = {v["vendor_id"]: v for v in data["vendors"]}
        # other tests share the DB, so assert invariants rather than absolute shares
        assert big in by_id and by_id[big]["value"] == 800
        # each row's share matches value/total and the over_threshold flag is consistent
        for v in data["vendors"]:
            assert abs(v["share"] - v["value"] / data["total_value"]) < 1e-4  # share is rounded to 4dp
            assert v["over_threshold"] == (v["share"] >= data["threshold"])

        # vendors are ordered by value desc with monotonic cumulative share
        values = [v["value"] for v in data["vendors"]]
        assert values == sorted(values, reverse=True)
        cum = [v["cumulative_share"] for v in data["vendors"]]
        assert cum == sorted(cum)
        assert abs(cum[-1] - 1.0) < 0.01  # cumulative reaches ~100%
        assert 0 <= data["hhi"] <= 1
        assert data["vendors_for_80pct"] >= 1
