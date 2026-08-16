"""Tests for contract types and tags (categorization + filtering)."""


class TestContractTypes:
    def test_type_vocabulary_and_filter(self, client, admin_headers):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="TypedVendor", contract_service="svc",
                     contract_type="NDA", status=ContractStatus.VALIDATED,
                     raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()

        # vocabulary endpoint returns the configured list
        types = client.get("/api/contracts/types", headers=admin_headers).json()["types"]
        assert "NDA" in types and "MSA" in types

        # the contract carries its type through the serializer
        got = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
        assert got["contract_type"] == "NDA"

        # filtering by type narrows the list
        listed = client.get("/api/contracts?contract_type=NDA", headers=admin_headers).json()
        assert any(x["sr_no"] == sr for x in listed["items"])
        empty = client.get("/api/contracts?contract_type=Lease", headers=admin_headers).json()
        assert all(x["sr_no"] != sr for x in empty["items"])


class TestTags:
    def _contract(self, contract_type=None):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="TagVendor", contract_service="svc",
                     status=ContractStatus.VALIDATED, raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        return sr

    def test_create_assign_filter_and_delete(self, client, admin_headers):
        sr = self._contract()
        tag = client.post("/api/tags", headers=admin_headers,
                          json={"name": "Urgent", "color": "#c00"}).json()
        assert tag["name"] == "Urgent"

        # duplicate name is rejected
        assert client.post("/api/tags", headers=admin_headers,
                           json={"name": "urgent"}).status_code == 409

        # assign to the contract
        r = client.put(f"/api/contracts/{sr}/tags", headers=admin_headers,
                       json={"tag_ids": [tag["id"]]})
        assert r.status_code == 200
        assert [t["name"] for t in r.json()["tags"]] == ["Urgent"]

        # the contract now reports the tag, and the tag count reflects usage
        got = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
        assert [t["name"] for t in got["tags"]] == ["Urgent"]
        listed_tags = client.get("/api/tags", headers=admin_headers).json()
        assert next(t for t in listed_tags if t["id"] == tag["id"])["contract_count"] == 1

        # filter contracts by tag
        by_tag = client.get(f"/api/contracts?tag_id={tag['id']}", headers=admin_headers).json()
        assert any(x["sr_no"] == sr for x in by_tag["items"])

        # unknown tag id is rejected
        assert client.put(f"/api/contracts/{sr}/tags", headers=admin_headers,
                          json={"tag_ids": [999999]}).status_code == 404

        # deleting the tag detaches it from the contract
        assert client.delete(f"/api/tags/{tag['id']}", headers=admin_headers).status_code == 200
        got = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
        assert got["tags"] == []

    def test_bulk_add_and_remove_tags(self, client, admin_headers):
        sr1, sr2 = self._contract(), self._contract()
        tag = client.post("/api/tags", headers=admin_headers, json={"name": "Bulk"}).json()

        # bulk add to both
        r = client.post("/api/contracts/bulk", headers=admin_headers, json={
            "sr_nos": [sr1, sr2], "action": "add_tags", "tag_ids": [tag["id"]],
        })
        assert r.status_code == 200
        assert r.json()["updated_count"] == 2
        for sr in (sr1, sr2):
            got = client.get(f"/api/contracts/{sr}", headers=admin_headers).json()
            assert [t["name"] for t in got["tags"]] == ["Bulk"]

        # adding again is a no-op (reported as skipped, not updated)
        r2 = client.post("/api/contracts/bulk", headers=admin_headers, json={
            "sr_nos": [sr1], "action": "add_tags", "tag_ids": [tag["id"]],
        })
        assert r2.json()["updated_count"] == 0
        assert r2.json()["skipped"][0]["reason"] == "no tag change"

        # bulk remove from one
        r3 = client.post("/api/contracts/bulk", headers=admin_headers, json={
            "sr_nos": [sr1], "action": "remove_tags", "tag_ids": [tag["id"]],
        })
        assert r3.json()["updated_count"] == 1
        assert client.get(f"/api/contracts/{sr1}", headers=admin_headers).json()["tags"] == []
        # sr2 still tagged
        assert [t["name"] for t in client.get(f"/api/contracts/{sr2}", headers=admin_headers).json()["tags"]] == ["Bulk"]

        # unknown tag id is rejected; missing tag_ids too
        assert client.post("/api/contracts/bulk", headers=admin_headers, json={
            "sr_nos": [sr1], "action": "add_tags", "tag_ids": [999999]}).status_code == 404
        assert client.post("/api/contracts/bulk", headers=admin_headers, json={
            "sr_nos": [sr1], "action": "add_tags", "tag_ids": []}).status_code == 400

    def test_bulk_set_type(self, client, admin_headers):
        sr1, sr2 = self._contract(), self._contract()
        r = client.post("/api/contracts/bulk", headers=admin_headers, json={
            "sr_nos": [sr1, sr2], "action": "set_type", "contract_type": "MSA",
        })
        assert r.status_code == 200 and r.json()["updated_count"] == 2
        for sr in (sr1, sr2):
            assert client.get(f"/api/contracts/{sr}", headers=admin_headers).json()["contract_type"] == "MSA"

        # re-applying the same type is a no-op
        r2 = client.post("/api/contracts/bulk", headers=admin_headers, json={
            "sr_nos": [sr1], "action": "set_type", "contract_type": "MSA"})
        assert r2.json()["updated_count"] == 0
        assert r2.json()["skipped"][0]["reason"] == "no type change"

        # empty string clears the type
        r3 = client.post("/api/contracts/bulk", headers=admin_headers, json={
            "sr_nos": [sr1], "action": "set_type", "contract_type": ""})
        assert r3.json()["updated_count"] == 1
        assert client.get(f"/api/contracts/{sr1}", headers=admin_headers).json()["contract_type"] is None

    def test_deleted_tag_name_can_be_reused(self, client, admin_headers):
        t1 = client.post("/api/tags", headers=admin_headers, json={"name": "Seasonal"}).json()
        assert client.delete(f"/api/tags/{t1['id']}", headers=admin_headers).status_code == 200
        # re-creating the same name revives the row instead of erroring
        t2 = client.post("/api/tags", headers=admin_headers, json={"name": "Seasonal"}).json()
        assert t2["id"] == t1["id"]
