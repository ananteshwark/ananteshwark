"""Tests for the in-app notification center."""


class TestNotificationCenter:
    def _contract(self):
        from app.database import SessionLocal
        from app.models import Contract, ContractStatus
        db = SessionLocal()
        c = Contract(vendor_name_raw="NotifVendor", contract_service="svc",
                     status=ContractStatus.PENDING_VALIDATION, raw_extracted={}, confidence={})
        db.add(c); db.commit(); sr = c.sr_no; db.close()
        return sr

    def _validator(self, client, admin_headers, email):
        uid = client.post("/api/auth/users", headers=admin_headers,
                          json={"email": email, "name": "Notif V", "password": "password123",
                                "role": "VALIDATOR"}).json()["id"]
        token = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()["token"]
        return uid, {"Authorization": f"Bearer {token}"}

    def test_assignment_creates_notification_for_assignee(self, client, admin_headers):
        sr = self._contract()
        uid, vheaders = self._validator(client, admin_headers, "notif1@example.com")

        # admin assigns the validator -> the validator gets a notification
        client.put(f"/api/contracts/{sr}/assignee", headers=admin_headers, json={"user_id": uid})

        count = client.get("/api/notifications/unread-count", headers=vheaders).json()["unread"]
        assert count >= 1
        items = client.get("/api/notifications", headers=vheaders).json()
        assert any(f"#{sr}" in n["message"] and n["link"] == f"/contracts/{sr}" for n in items)

    def test_mark_read_and_read_all(self, client, admin_headers):
        sr = self._contract()
        uid, vheaders = self._validator(client, admin_headers, "notif2@example.com")
        client.put(f"/api/contracts/{sr}/assignee", headers=admin_headers, json={"user_id": uid})

        items = client.get("/api/notifications", headers=vheaders).json()
        nid = items[0]["id"]
        assert client.post(f"/api/notifications/{nid}/read", headers=vheaders).status_code == 200

        # a second assignment then read-all clears everything
        sr2 = self._contract()
        client.put(f"/api/contracts/{sr2}/assignee", headers=admin_headers, json={"user_id": uid})
        assert client.get("/api/notifications/unread-count", headers=vheaders).json()["unread"] >= 1
        client.post("/api/notifications/read-all", headers=vheaders)
        assert client.get("/api/notifications/unread-count", headers=vheaders).json()["unread"] == 0

    def test_notifications_are_per_user(self, client, admin_headers):
        sr = self._contract()
        uid, vheaders = self._validator(client, admin_headers, "notif3@example.com")
        _, other = self._validator(client, admin_headers, "notif4@example.com")
        client.put(f"/api/contracts/{sr}/assignee", headers=admin_headers, json={"user_id": uid})
        # the other validator sees none of these
        assert all(f"#{sr}" not in n["message"]
                   for n in client.get("/api/notifications", headers=other).json())

    def test_self_assignment_no_notification(self, client, admin_headers):
        # admin assigns the contract to themselves -> no self-notification
        sr = self._contract()
        me = client.get("/api/auth/me", headers=admin_headers).json()
        before = client.get("/api/notifications/unread-count", headers=admin_headers).json()["unread"]
        client.put(f"/api/contracts/{sr}/assignee", headers=admin_headers, json={"user_id": me["id"]})
        after = client.get("/api/notifications/unread-count", headers=admin_headers).json()["unread"]
        assert after == before
