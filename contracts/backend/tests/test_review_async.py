"""R4 3.1: async gap analysis with progress polling."""
import time


def _draft(client, h):
    d = client.post("/api/authoring/drafts", headers=h,
                    json={"origin": "scratch", "contract_type": "MSA"}).json()
    client.post(f"/api/authoring/drafts/{d['id']}/insert-clause", headers=h,
                json={"clause_type": "Indemnity", "text": "The vendor shall indemnify the company."})
    return d


def test_async_review_completes(client, admin_headers):
    d = _draft(client, admin_headers)
    start = client.post(f"/api/authoring/drafts/{d['id']}/review-async", headers=admin_headers)
    assert start.status_code == 200 and start.json()["status"] == "running"

    result = None
    for _ in range(50):
        status = client.get(f"/api/authoring/drafts/{d['id']}/review-status", headers=admin_headers).json()
        if status["status"] in ("done", "error"):
            result = status
            break
        time.sleep(0.05)
    assert result is not None and result["status"] == "done"
    assert "score" in result["result"] and "missing" in result["result"]


def test_status_idle_before_start(client, admin_headers):
    d = client.post("/api/authoring/drafts", headers=admin_headers,
                    json={"origin": "scratch", "contract_type": "NDA"}).json()
    s = client.get(f"/api/authoring/drafts/{d['id']}/review-status", headers=admin_headers).json()
    assert s["status"] == "idle"
