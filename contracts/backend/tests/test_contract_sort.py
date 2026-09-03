"""Tests for sortable columns on the contracts list endpoint."""
from app.models import ContractStatus


def _seed(client, admin_headers):
    from app.database import SessionLocal
    from app.models import Contract
    db = SessionLocal()
    made = []
    for name, value in [("Zeta Corp", 300), ("Alpha Ltd", 100), ("Mango Inc", 200)]:
        c = Contract(vendor_name_raw=name, contract_service="svc", contract_value=value,
                     status=ContractStatus.VALIDATED, raw_extracted={}, confidence={})
        db.add(c); db.flush(); made.append(c.sr_no)
    db.commit(); db.close()
    return made


class TestContractSort:
    def test_sort_by_vendor_ascending(self, client, admin_headers):
        _seed(client, admin_headers)
        r = client.get("/api/contracts?sort=vendor&order=asc&limit=500", headers=admin_headers)
        assert r.status_code == 200
        names = [i["vendor_name"] for i in r.json()["items"]]
        seeded = [n for n in names if n in ("Alpha Ltd", "Mango Inc", "Zeta Corp")]
        assert seeded == sorted(seeded)

    def test_sort_by_vendor_descending(self, client, admin_headers):
        _seed(client, admin_headers)
        r = client.get("/api/contracts?sort=vendor&order=desc&limit=500", headers=admin_headers)
        names = [i["vendor_name"] for i in r.json()["items"]]
        seeded = [n for n in names if n in ("Alpha Ltd", "Mango Inc", "Zeta Corp")]
        assert seeded == sorted(seeded, reverse=True)

    def test_sort_by_value_ascending(self, client, admin_headers):
        _seed(client, admin_headers)
        r = client.get("/api/contracts?sort=value&order=asc&limit=500", headers=admin_headers)
        vals = [i["contract_value"] for i in r.json()["items"] if i["contract_value"] is not None]
        assert vals == sorted(vals)

    def test_default_sort_is_sr_no_desc(self, client, admin_headers):
        _seed(client, admin_headers)
        r = client.get("/api/contracts?limit=500", headers=admin_headers)
        srs = [i["sr_no"] for i in r.json()["items"]]
        assert srs == sorted(srs, reverse=True)

    def test_unknown_sort_key_falls_back(self, client, admin_headers):
        _seed(client, admin_headers)
        r = client.get("/api/contracts?sort=bogus&order=asc&limit=500", headers=admin_headers)
        assert r.status_code == 200  # falls back to sr_no rather than erroring


class TestLifecycleFilter:
    def _seed_lifecycles(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, LifecycleStatus
        db = SessionLocal()
        for name, lc in [("LC Active", LifecycleStatus.ACTIVE),
                         ("LC Expired", LifecycleStatus.EXPIRED),
                         ("LC Terminated", LifecycleStatus.TERMINATED)]:
            c = Contract(vendor_name_raw=name, contract_service="svc",
                         status=ContractStatus.VALIDATED, lifecycle_status=lc,
                         raw_extracted={}, confidence={})
            db.add(c)
        db.commit(); db.close()

    def test_filter_by_lifecycle_status(self, client, admin_headers):
        self._seed_lifecycles(client, admin_headers)
        r = client.get("/api/contracts?lifecycle_status=EXPIRED&limit=500", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()["items"]
        assert items and all(i["lifecycle_status"] == "EXPIRED" for i in items)

    def test_invalid_lifecycle_status_rejected(self, client, admin_headers):
        r = client.get("/api/contracts?lifecycle_status=BOGUS", headers=admin_headers)
        assert r.status_code == 400


class TestExport:
    def test_csv_export_honors_sort(self, client, admin_headers):
        _seed(client, admin_headers)  # Zeta/Alpha/Mango
        r = client.get("/api/contracts/export?sort=vendor&order=asc&fmt=csv", headers=admin_headers)
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/csv")
        text = r.content.decode("utf-8-sig")
        lines = [ln for ln in text.splitlines() if ln.strip()]
        assert lines[0].startswith("Sr No")
        # Vendor is column 3; the seeded vendors should appear in ascending order.
        vendors = [ln.split(",")[2] for ln in lines[1:]]
        seeded = [v for v in vendors if v in ("Alpha Ltd", "Mango Inc", "Zeta Corp")]
        assert seeded == sorted(seeded)

    def test_xlsx_export_default(self, client, admin_headers):
        _seed(client, admin_headers)
        r = client.get("/api/contracts/export", headers=admin_headers)
        assert r.status_code == 200
        assert r.content[:2] == b"PK"  # xlsx is a zip


class TestMultiFilter:
    def test_multiple_lifecycles_match_any(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, LifecycleStatus
        db = SessionLocal()
        for name, lc in [("MF Active", LifecycleStatus.ACTIVE),
                         ("MF Expired", LifecycleStatus.EXPIRED),
                         ("MF Terminated", LifecycleStatus.TERMINATED)]:
            db.add(Contract(vendor_name_raw=name, contract_service="svc",
                            status=ContractStatus.VALIDATED, lifecycle_status=lc,
                            raw_extracted={}, confidence={}))
        db.commit(); db.close()
        r = client.get("/api/contracts?lifecycle_status=ACTIVE&lifecycle_status=EXPIRED&limit=500",
                       headers=admin_headers)
        assert r.status_code == 200
        lcs = {i["lifecycle_status"] for i in r.json()["items"]}
        assert "TERMINATED" not in lcs
        assert {"ACTIVE", "EXPIRED"} & lcs

    def test_multiple_statuses_match_any(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract
        db = SessionLocal()
        for name, st in [("MS Val", ContractStatus.VALIDATED), ("MS Rej", ContractStatus.REJECTED)]:
            db.add(Contract(vendor_name_raw=name, contract_service="svc",
                            status=st, raw_extracted={}, confidence={}))
        db.commit(); db.close()
        r = client.get("/api/contracts?status=VALIDATED&status=REJECTED&limit=500", headers=admin_headers)
        assert r.status_code == 200
        sts = {i["status"] for i in r.json()["items"]}
        assert sts <= {"VALIDATED", "REJECTED"} and "VALIDATED" in sts
