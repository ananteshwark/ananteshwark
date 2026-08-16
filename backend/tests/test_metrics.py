"""R4 3.5: request metrics endpoint + response-time header."""


def test_metrics_requires_admin(client, admin_headers):
    # generate some traffic
    client.get("/api/contracts", headers=admin_headers)
    r = client.get("/api/metrics", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total_requests"] >= 1
    assert "uptime_seconds" in body and isinstance(body["routes"], list)


def test_response_time_header(client, admin_headers):
    r = client.get("/api/health")
    assert "X-Response-Time-ms" in r.headers


def test_metrics_forbidden_for_viewer(client, admin_headers):
    client.post("/api/auth/users", headers=admin_headers,
                json={"email": "viewer_m@example.com", "name": "V", "password": "viewer12345", "role": "VIEWER"})
    token = client.post("/api/auth/login",
                        json={"email": "viewer_m@example.com", "password": "viewer12345"}).json()["token"]
    r = client.get("/api/metrics", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403
