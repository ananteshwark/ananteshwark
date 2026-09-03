"""Master switches for folder monitoring and AI extraction."""
import threading
import time


class TestExtractionToggle:
    def test_settings_api_flips_runtime_flag(self, client, admin_headers):
        from app.services import extraction_worker as W
        r = client.put("/api/settings", headers=admin_headers,
                       json={"values": {"extraction_enabled": "false"}})
        assert r.status_code == 200 and W.extraction_enabled() is False
        r = client.put("/api/settings", headers=admin_headers,
                       json={"values": {"extraction_enabled": "true"}})
        assert r.status_code == 200 and W.extraction_enabled() is True

    def test_worker_loop_honors_pause_and_resume(self, client, admin_headers):
        from app.services import extraction_worker as W
        W.set_extraction_enabled(False)
        worker = threading.Thread(target=W._worker_loop, daemon=True)
        worker.start()
        try:
            before = W.extraction_queue.qsize()
            W.extraction_queue.put(999999)   # non-existent id; process_file is a no-op for it
            time.sleep(1.5)
            # Paused → the queued item is NOT consumed.
            assert W.extraction_queue.qsize() == before + 1

            W.set_extraction_enabled(True)
            for _ in range(25):
                if W.extraction_queue.qsize() == before:
                    break
                time.sleep(0.2)
            # Resumed → the queue drains.
            assert W.extraction_queue.qsize() == before
        finally:
            W.extraction_queue.put(None)     # stop the worker thread
            worker.join(timeout=3)
            W.set_extraction_enabled(True)   # leave enabled for other tests

    def test_system_status_reports_extraction(self, client, admin_headers):
        client.put("/api/settings", headers=admin_headers, json={"values": {"extraction_enabled": "true"}})
        st = client.get("/api/settings/system-status", headers=admin_headers).json()
        assert "extraction" in st and st["extraction"]["enabled"] is True

    def test_watch_enabled_is_settable(self, client, admin_headers):
        r = client.put("/api/settings", headers=admin_headers, json={"values": {"watch_enabled": "false"}})
        assert r.status_code == 200 and r.json()["watch_enabled"] == "false"
        client.put("/api/settings", headers=admin_headers, json={"values": {"watch_enabled": "true"}})


class TestPauseAllIngestion:
    def test_pause_and_resume_restores_state(self, client, admin_headers):
        from app.services import extraction_worker as W
        # Start from a known state: watch on, gdrive off, extraction on.
        client.put("/api/settings", headers=admin_headers, json={"values": {
            "watch_enabled": "true", "gdrive_enabled": "false", "extraction_enabled": "true"}})

        paused = client.post("/api/settings/ingestion/pause-all", headers=admin_headers).json()
        assert paused["paused_all"] is True
        assert paused["watch_enabled"] is False and paused["extraction_enabled"] is False
        assert W.extraction_enabled() is False

        resumed = client.post("/api/settings/ingestion/resume-all", headers=admin_headers).json()
        # Restores exactly the pre-pause state (gdrive stays off, others back on).
        assert resumed["watch_enabled"] is True and resumed["extraction_enabled"] is True
        assert resumed["gdrive_enabled"] is False
        assert W.extraction_enabled() is True
