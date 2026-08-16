from app.services.gdrive import (
    _friendly_drive_error,
    is_supported_drive_file,
    parse_folder_ids,
    select_new_drive_files,
    service_account_email,
)

EXTS = [".pdf", ".docx", ".jpg", ".jpeg", ".png"]


class TestIsSupportedDriveFile:
    def test_pdf_by_extension(self):
        assert is_supported_drive_file({"name": "contract.PDF", "mimeType": "application/pdf"}, EXTS)

    def test_docx_by_extension(self):
        assert is_supported_drive_file({"name": "agreement.docx", "mimeType": "x"}, EXTS)

    def test_google_doc_exported_as_pdf(self):
        meta = {"name": "MSA", "mimeType": "application/vnd.google-apps.document"}
        assert is_supported_drive_file(meta, EXTS)

    def test_google_doc_skipped_when_pdf_not_supported(self):
        meta = {"name": "MSA", "mimeType": "application/vnd.google-apps.document"}
        assert not is_supported_drive_file(meta, [".docx"])

    def test_folders_are_not_files(self):
        assert not is_supported_drive_file(
            {"name": "2025", "mimeType": "application/vnd.google-apps.folder"}, EXTS
        )

    def test_unsupported_extension_skipped(self):
        assert not is_supported_drive_file({"name": "notes.txt", "mimeType": "text/plain"}, EXTS)

    def test_google_sheet_skipped(self):
        assert not is_supported_drive_file(
            {"name": "budget", "mimeType": "application/vnd.google-apps.spreadsheet"}, EXTS
        )


class TestSelectNewDriveFiles:
    def test_filters_already_imported(self):
        existing = {"a", "b"}
        files = [{"id": "a"}, {"id": "c"}, {"id": "d"}]
        assert [f["id"] for f in select_new_drive_files(existing, files)] == ["c", "d"]

    def test_all_new_when_nothing_imported(self):
        files = [{"id": "x"}, {"id": "y"}]
        assert len(select_new_drive_files(set(), files)) == 2

    def test_none_new_when_all_imported(self):
        files = [{"id": "x"}]
        assert select_new_drive_files({"x"}, files) == []


class TestServiceAccountEmail:
    def test_extracts_client_email(self):
        creds = '{"type":"service_account","client_email":"cms@proj.iam.gserviceaccount.com"}'
        assert service_account_email(creds) == "cms@proj.iam.gserviceaccount.com"

    def test_invalid_json_returns_none(self):
        assert service_account_email("not json") is None
        assert service_account_email("") is None


class TestFriendlyDriveError:
    class _Resp:
        def __init__(self, status):
            self.status = status

    class _ApiError(Exception):
        def __init__(self, status, msg=""):
            super().__init__(msg)
            self.resp = TestFriendlyDriveError._Resp(status)

    def test_404_is_actionable_with_sa_email(self):
        msg = _friendly_drive_error(self._ApiError(404, "notFound"), "FID", "sa@x.iam")
        assert "FID" in msg and "sa@x.iam" in msg and "share" in msg.lower()

    def test_403_mentions_access_denied(self):
        msg = _friendly_drive_error(self._ApiError(403, "forbidden"), "FID", "sa@x.iam")
        assert "denied" in msg.lower() and "sa@x.iam" in msg

    def test_generic_error_falls_through(self):
        msg = _friendly_drive_error(RuntimeError("boom"), "FID", None)
        assert "FID" in msg and "boom" in msg


class TestPollReport:
    """poll_report explains a zero-import poll instead of silently returning 0."""

    def _watcher(self):
        from app.services.gdrive import GoogleDriveWatcher
        return GoogleDriveWatcher(extraction_queue=None)

    def test_disabled_reports_reason(self, monkeypatch):
        w = self._watcher()
        monkeypatch.setattr(w, "_config", lambda: {
            "enabled": False, "folder_ids": [], "credentials": "",
            "poll_seconds": 300, "staging_dir": "./x", "extensions": EXTS,
        })
        r = w.poll_report()
        assert r["ok"] is False and "off" in r["message"].lower()

    def test_enabled_without_folders_reports_reason(self, monkeypatch):
        w = self._watcher()
        monkeypatch.setattr(w, "_config", lambda: {
            "enabled": True, "folder_ids": [], "credentials": '{"client_email":"a@b"}',
            "poll_seconds": 300, "staging_dir": "./x", "extensions": EXTS,
        })
        r = w.poll_report()
        assert r["ok"] is False and "folder" in r["message"].lower()

    def test_listing_error_surfaced_per_folder(self, client, monkeypatch, tmp_path):
        from app.services import gdrive as G
        w = self._watcher()
        monkeypatch.setattr(w, "_config", lambda: {
            "enabled": True, "folder_ids": ["FID"], "credentials": '{"client_email":"sa@x.iam"}',
            "poll_seconds": 300, "staging_dir": str(tmp_path), "extensions": EXTS,
        })
        monkeypatch.setattr(G, "_build_service", lambda creds: object())
        def _boom(service, folder_id):
            raise RuntimeError("notFound")
        monkeypatch.setattr(G, "_list_folder", _boom)
        r = w.poll_report()
        assert r["ok"] is False
        assert r["imported"] == 0
        assert r["folders"][0]["error"] and "FID" in r["folders"][0]["error"]

    def test_lists_and_imports_new_files(self, client, monkeypatch, tmp_path):
        from app.services import gdrive as G
        w = self._watcher()
        monkeypatch.setattr(w, "_config", lambda: {
            "enabled": True, "folder_ids": ["FID"], "credentials": '{"client_email":"sa@x.iam"}',
            "poll_seconds": 300, "staging_dir": str(tmp_path), "extensions": EXTS,
        })
        monkeypatch.setattr(G, "_build_service", lambda creds: object())
        monkeypatch.setattr(G, "_list_folder", lambda service, folder_id: [
            {"id": "f1", "name": "a.pdf", "mimeType": "application/pdf"},
            {"id": "f2", "name": "skip.txt", "mimeType": "text/plain"},
        ])
        monkeypatch.setattr(G, "_download", lambda service, meta, dest: dest)
        registered = []
        import app.services.watcher as W
        monkeypatch.setattr(W, "register_file", lambda *a, **k: registered.append(k.get("external_id")))
        r = w.poll_report()
        assert r["ok"] is True
        assert r["imported"] == 1 and r["seen"] == 2
        assert r["folders"][0]["candidates"] == 1
        assert registered == ["f1"]
    def test_newline_separated(self):
        assert parse_folder_ids("id1\nid2\n") == ["id1", "id2"]

    def test_comma_separated(self):
        assert parse_folder_ids("id1, id2") == ["id1", "id2"]

    def test_mixed_and_blank_lines(self):
        assert parse_folder_ids(" id1 \n\n id2 , id3 ") == ["id1", "id2", "id3"]

    def test_empty(self):
        assert parse_folder_ids("") == []
