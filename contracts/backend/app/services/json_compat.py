"""Read a JSON column that an older migration created as TEXT.

Two columns (`clause_risk`, `content_sketch`) were added with TEXT DDL while the
model declares them JSON. On SQLite that is invisible — JSON *is* TEXT there, and
SQLAlchemy's JSON type round-trips it either way. On Postgres the column really
is text, so every read comes back as a string while a value just computed in the
same process is still a list. Comparing the two crashed the validation screen.

The DDL is fixed for new installs, but a database that already ran the old
migration keeps its TEXT column, so reads have to tolerate both shapes.
"""
from __future__ import annotations

import json
import logging

log = logging.getLogger(__name__)


def as_json(value, default=None):
    """Return `value` decoded, whether it arrived as JSON or as a JSON string."""
    if value is None:
        return default
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8", "replace")
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return default
        try:
            return json.loads(text)
        except ValueError:
            log.warning("Stored JSON column could not be decoded (%d chars)", len(text))
            return default
    return default
