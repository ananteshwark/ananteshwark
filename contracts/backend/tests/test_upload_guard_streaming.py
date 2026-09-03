"""An oversized upload must be refused without being read into memory first.

read_upload's contract is not just "rejects big files" — a 413 raised after
buffering the whole body would still let one request exhaust the box, which is
the thing the guard exists to prevent. What matters is how much it read before
saying no, and nothing asserted that.

The stream below counts what is pulled from it and generates its content
lazily, so a 2 GB upload can be simulated without allocating 2 GB. If the guard
ever regresses to `file.file.read()` in one call, these fail rather than
silently passing because the assertion was only about the status code.
"""
import pytest
from fastapi import HTTPException

from app.services import upload_guard as ug

MB = 1024 * 1024


class CountingStream:
    """A file-like object of `size` bytes that never allocates them all."""

    def __init__(self, size):
        self.size = size
        self.pos = 0
        self.bytes_read = 0
        self.reads = 0

    def seek(self, pos, _whence=0):
        self.pos = pos

    def read(self, n=-1):
        remaining = self.size - self.pos
        take = remaining if n is None or n < 0 else min(n, remaining)
        if take <= 0:
            return b""
        self.pos += take
        self.bytes_read += take
        self.reads += 1
        return b"\0" * take


class FakeUpload:
    def __init__(self, filename, size):
        self.filename = filename
        self.file = CountingStream(size)


class TestOversizedUploadsStopEarly:
    def test_26mb_is_rejected_with_413(self):
        up = FakeUpload("scan.pdf", 26 * MB)
        with pytest.raises(HTTPException) as exc:
            ug.read_upload(up, allowed_exts=ug.DOC_EXTS)
        assert exc.value.status_code == 413
        assert "25 MB" in exc.value.detail

    def test_it_stops_reading_once_the_limit_is_crossed(self):
        """At most one chunk beyond the ceiling — not the whole body."""
        up = FakeUpload("scan.pdf", 26 * MB)
        with pytest.raises(HTTPException):
            ug.read_upload(up, allowed_exts=ug.DOC_EXTS)
        assert up.file.bytes_read <= ug.DEFAULT_MAX_BYTES + ug._CHUNK, (
            f"read {up.file.bytes_read / MB:.1f} MB before refusing a "
            f"{ug.DEFAULT_MAX_BYTES / MB:.0f} MB limit")

    def test_a_two_gigabyte_upload_reads_no_more_than_a_small_one(self):
        """The bound is the ceiling, not the body. This is the property that
        makes the guard a defence rather than a status code: a huge upload must
        cost the same as a just-oversized one."""
        small = FakeUpload("scan.pdf", 26 * MB)
        huge = FakeUpload("scan.pdf", 2048 * MB)
        for up in (small, huge):
            with pytest.raises(HTTPException):
                ug.read_upload(up, allowed_exts=ug.DOC_EXTS)
        assert huge.file.bytes_read == small.file.bytes_read
        assert huge.file.bytes_read <= ug.DEFAULT_MAX_BYTES + ug._CHUNK

    def test_a_lower_ceiling_is_honoured(self):
        up = FakeUpload("scan.pdf", 26 * MB)
        with pytest.raises(HTTPException) as exc:
            ug.read_upload(up, allowed_exts=ug.DOC_EXTS, max_bytes=2 * MB)
        assert exc.value.status_code == 413
        assert up.file.bytes_read <= 2 * MB + ug._CHUNK


class TestExtensionIsCheckedBeforeReading:
    def test_disallowed_extension_reads_nothing_at_all(self):
        """The allowlist must gate the read, not follow it — otherwise a 2 GB
        .exe costs the same as a legitimate contract before being refused."""
        up = FakeUpload("payload.exe", 2048 * MB)
        with pytest.raises(HTTPException) as exc:
            ug.read_upload(up, allowed_exts=ug.DOC_EXTS)
        assert exc.value.status_code == 415
        assert up.file.reads == 0, "the body was read before the type was checked"

    def test_the_message_names_what_is_allowed(self):
        up = FakeUpload("notes.txt", 10)
        with pytest.raises(HTTPException) as exc:
            ug.read_upload(up, allowed_exts=ug.DOC_EXTS)
        assert ".pdf" in exc.value.detail and ".docx" in exc.value.detail


class TestAcceptedUploads:
    def test_a_file_under_the_ceiling_is_returned_whole(self):
        up = FakeUpload("scan.pdf", 3 * MB)
        data = ug.read_upload(up, allowed_exts=ug.DOC_EXTS)
        assert len(data) == 3 * MB
        assert isinstance(data, bytes)

    def test_a_file_exactly_at_the_ceiling_is_accepted(self):
        """The limit is a ceiling, not an exclusive bound — a file of exactly
        25 MB is within a 25 MB limit."""
        up = FakeUpload("scan.pdf", ug.DEFAULT_MAX_BYTES)
        assert len(ug.read_upload(up, allowed_exts=ug.DOC_EXTS)) == ug.DEFAULT_MAX_BYTES

    def test_empty_file_is_rejected(self):
        up = FakeUpload("scan.pdf", 0)
        with pytest.raises(HTTPException) as exc:
            ug.read_upload(up, allowed_exts=ug.DOC_EXTS)
        assert exc.value.status_code == 400

    def test_no_allowlist_permits_any_extension(self):
        up = FakeUpload("anything.zip", 1024)
        assert len(ug.read_upload(up)) == 1024
