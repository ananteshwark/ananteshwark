"""Lightweight additive migrations.

The app creates tables with SQLAlchemy `create_all`, which never ALTERs an
existing table. When a release adds a column to an existing table, add an
idempotent ADD COLUMN here so already-deployed databases (SQLite or Postgres)
pick it up on boot. New/empty databases get the column from `create_all` and
these statements simply no-op.
"""
import logging

from sqlalchemy import inspect, text

from .database import engine

log = logging.getLogger(__name__)

# (table, column, DDL type + default) tuples applied if the column is missing.
_ADD_COLUMNS = [
    ("ingestion_files", "source", "VARCHAR(20) DEFAULT 'LOCAL'"),
    ("ingestion_files", "external_id", "VARCHAR(255)"),
    ("contracts", "extracted_text", "TEXT"),
    # JSON, not TEXT: a JSON model column backed by a TEXT database column
    # round-trips as a string and every reader gets a str where it expects a
    # dict. That mismatch has already shipped once on this project.
    ("contracts", "ocr_layout", "JSON"),
    ("contracts", "clause_risk", "JSON"),
    ("contracts", "clause_risk_at", "TIMESTAMP"),
    ("contracts", "clause_risk_hash", "VARCHAR(64)"),
    ("contracts", "content_sketch", "JSON"),
    ("contracts", "content_sketch_hash", "VARCHAR(64)"),
    ("contract_requests", "internal_entity", "VARCHAR(255)"),
    ("contract_requests", "purpose", "TEXT"),
    ("contract_requests", "counterparty_address", "TEXT"),
    ("contract_requests", "spoc_name", "VARCHAR(200)"),
    ("contract_requests", "phi_shared", "BOOLEAN"),
    ("contract_requests", "start_date", "DATE"),
    ("contract_requests", "end_date", "DATE"),
    ("contract_requests", "tenure", "VARCHAR(40)"),
    ("contract_requests", "template_filename", "VARCHAR(255)"),
    ("contract_requests", "template_path", "TEXT"),
    ("ai_runs", "error", "TEXT"),
    ("clause_versions", "original_text", "TEXT"),
    ("contracts", "contract_type", "VARCHAR(80)"),
    ("contracts", "assignee_id", "INTEGER"),
    ("contracts", "reminders_snoozed_until", "DATE"),
    ("ingestion_files", "input_tokens", "INTEGER"),
    ("ingestion_files", "output_tokens", "INTEGER"),
    ("contracts", "payment_term", "VARCHAR(500)"),
    ("contracts", "notice_period", "VARCHAR(255)"),
    ("contracts", "line_items", "JSON"),
    ("contracts", "group_id", "INTEGER"),
    ("contracts", "escalation_after", "INTEGER"),
    ("contracts", "escalation_email", "VARCHAR(255)"),
    ("contracts", "learned_fields", "JSON"),
    ("departments", "approval_require_legal", "BOOLEAN"),
    ("departments", "approval_value_threshold", "NUMERIC(18,2)"),
    ("departments", "default_signers", "JSON"),
    ("vendor_share_links", "otp_failures", "INTEGER DEFAULT 0"),
    ("contract_drafts", "rev", "INTEGER DEFAULT 0"),
    ("contracts", "location", "VARCHAR(255)"),
    ("clause_versions", "polished_text", "TEXT"),
    ("clause_versions", "is_curated", "BOOLEAN DEFAULT FALSE"),
    ("clause_versions", "curated_rank", "INTEGER"),
    ("esign_envelopes", "certificate_path", "TEXT"),
    ("esign_envelopes", "options", "JSON"),
    ("vendor_share_links", "nudged_at", "TIMESTAMP"),
    ("contract_drafts", "vendor_accepted_at", "TIMESTAMP"),
    ("contracts", "phi_shared", "BOOLEAN"),
    ("contract_drafts", "internal_reviewed_at", "TIMESTAMP"),
    ("contract_drafts", "internal_reviewed_by_id", "INTEGER"),
    ("draft_review_requests", "suggested_text", "TEXT"),
    ("draft_review_requests", "resolution", "VARCHAR(20)"),
    ("draft_review_requests", "resolved_at", "TIMESTAMP"),
    ("users", "extra_roles", "JSON"),
    ("clause_versions", "playbook_tier", "VARCHAR(20)"),
    ("contracts", "ai_summary", "TEXT"),
    ("contracts", "ai_key_terms", "JSON"),
    ("contracts", "ai_indexed_at", "TIMESTAMP"),
    ("contracts", "embedding", "JSON"),
    ("contract_milestones", "obligation_type", "VARCHAR(60)"),
    ("contract_milestones", "owner_party", "VARCHAR(20)"),
    ("contract_milestones", "frequency", "VARCHAR(40)"),
    ("contract_milestones", "source_text", "TEXT"),
    ("contract_milestones", "ai_generated", "BOOLEAN DEFAULT FALSE"),
    ("contract_milestones", "owner_user_id", "INTEGER"),
    ("contracts", "savings_amount", "NUMERIC(18,2)"),
    ("contracts", "custom_fields", "JSON"),
    ("contracts", "legal_hold", "BOOLEAN DEFAULT FALSE"),
    ("contracts", "legal_hold_reason", "TEXT"),
    ("contracts", "legal_hold_by_id", "INTEGER"),
    ("contracts", "legal_hold_at", "TIMESTAMP"),
    ("contracts", "embedding_version", "INTEGER"),
    ("contracts", "clause_attributes", "JSON"),
    ("contracts", "risk_score", "INTEGER"),
    ("contracts", "risk_level", "VARCHAR(10)"),
    ("contracts", "risk_scored_at", "TIMESTAMP"),
    ("vendors", "risk_rating", "VARCHAR(20)"),
    ("vendors", "risk_notes", "TEXT"),
]

# (table, column, Postgres type) column-type widenings applied on Postgres only.
# SQLite ignores VARCHAR length (TEXT affinity), so it needs no change there.
_WIDEN_COLUMNS = [
    ("departments", "default_recipient_email", "VARCHAR(1000)"),
]


# (index name, table, column list) plain B-tree indexes. create_all() builds
# these from the model for a fresh database, but an existing deployment's
# contracts table was created before they were declared and would never get
# them — the same reason _ADD_COLUMNS exists. CREATE INDEX IF NOT EXISTS is
# understood by both Postgres and SQLite, so one statement covers both.
_ADD_INDEXES = [
    # The expiry sweep runs on every contracts page load and the nightly
    # reminder scan filters identically: equality on both status enums, then a
    # range on end_date. See models.Contract.__table_args__ for the measurement.
    ("ix_contracts_expiry_scan", "contracts", "status, lifecycle_status, end_date"),
    # Filtered on by the contracts list and every value report; `status` beside
    # it has always been indexed and this one never was.
    ("ix_contracts_lifecycle_status", "contracts", "lifecycle_status"),
]


# (index name, table, column) trigram GIN indexes created on Postgres for
# fast substring/full-text search over large tables.
_TRGM_INDEXES = [
    ("ix_clause_versions_text_trgm", "clause_versions", "text"),
    ("ix_contracts_extracted_text_trgm", "contracts", "extracted_text"),
]


def _create_trgm_indexes(tables: set) -> None:
    # pg_trgm may be unavailable without superuser; every step is best-effort.
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
            try:
                c.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
            except Exception:
                log.warning("pg_trgm extension unavailable; skipping trigram indexes")
                return
            for name, table, column in _TRGM_INDEXES:
                if table not in tables:
                    continue
                try:
                    c.execute(text(
                        f"CREATE INDEX IF NOT EXISTS {name} ON {table} "
                        f"USING gin ({column} gin_trgm_ops)"
                    ))
                    log.info("Migration: ensured trigram index %s", name)
                except Exception:
                    log.exception("Migration failed creating trigram index %s", name)
    except Exception:
        log.exception("Trigram index migration failed")


def _create_vector_index() -> None:
    """Postgres-only ANN index for retrieval at scale (G2).

    Brute-force cosine in Python is fine at hundreds of contracts and unusable at
    tens of thousands. When pgvector is present we mirror each contract's vector
    into a `vector` column and build an HNSW index; the application falls back to
    the in-Python path whenever this is unavailable, so SQLite and pgvector-less
    Postgres installs keep working unchanged.
    """
    from .database import SessionLocal
    from .services.embeddings import DIM, provider_dim

    # The column is declared at a fixed width and ADD COLUMN IF NOT EXISTS keeps
    # whatever width it was first built with — forever. Switching the embedding
    # provider changes the vector length, and pgvector then rejects every write:
    # "expected 256 dimensions, not 384". _sync_pgvector catches that in a
    # savepoint and disables the mirror for the process, so nothing breaks and
    # nothing says much either — the ANN path just turns itself off and search
    # falls back to brute force in Python, which is precisely what pgvector was
    # added to avoid at tens of thousands of contracts.
    db = SessionLocal()
    try:
        want = provider_dim(db)
    except Exception:
        want = None
    finally:
        db.close()
    if want is None:
        want = DIM

    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
            try:
                c.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            except Exception:
                log.info("pgvector unavailable; retrieval will use the in-process path")
                return
            try:
                current = c.execute(text(
                    "SELECT format_type(a.atttypid, a.atttypmod) FROM pg_attribute a "
                    "JOIN pg_class cl ON cl.oid = a.attrelid "
                    "JOIN pg_namespace n ON n.oid = cl.relnamespace "
                    "WHERE cl.relname = 'contracts' AND a.attname = 'embedding_vec' "
                    "AND a.attnum > 0 AND NOT a.attisdropped"
                )).scalar()
                if current is not None and current != f"vector({want})":
                    # Rebuild rather than ALTER TYPE: a provider change bumps the
                    # embedding version, so every vector has to be regenerated by
                    # a re-index anyway and the mirrored column holds nothing
                    # usable. Dropping it is the cheap way to the right width.
                    log.warning("pgvector column is %s but the configured provider needs "
                                "vector(%d) — rebuilding it; re-index to repopulate",
                                current, want)
                    c.execute(text("DROP INDEX IF EXISTS ix_contracts_embedding_hnsw"))
                    c.execute(text("ALTER TABLE contracts DROP COLUMN IF EXISTS embedding_vec"))
                c.execute(text(
                    f"ALTER TABLE contracts ADD COLUMN IF NOT EXISTS embedding_vec vector({want})"
                ))
                c.execute(text(
                    "CREATE INDEX IF NOT EXISTS ix_contracts_embedding_hnsw "
                    "ON contracts USING hnsw (embedding_vec vector_cosine_ops)"
                ))
                log.info("Migration: ensured pgvector HNSW index on contracts (vector(%d))", want)
            except Exception:
                log.exception("Migration failed creating the pgvector index")
    except Exception:
        log.exception("pgvector migration failed")


# Model names the provider has withdrawn, mapped to the current equivalent.
# A saved setting outlives the model it names: the app keeps sending
# "gemini-1.5-pro" long after Google removed the 1.5 series from the Gemini API,
# and every call comes back 404. Since the old value cannot work, rewriting it
# preserves nothing, and leaving it alone means the provider stays silently
# broken until someone opens Settings and notices.
_WITHDRAWN_MODELS = {
    "gemini_model": {
        "gemini-1.5-pro": "gemini-2.5-pro",
        "gemini-1.5-pro-latest": "gemini-2.5-pro",
        "gemini-1.5-flash": "gemini-2.5-flash",
        "gemini-1.5-flash-latest": "gemini-2.5-flash",
        "gemini-pro": "gemini-2.5-pro",
    },
}


def _retire_withdrawn_models() -> None:
    for key, replacements in _WITHDRAWN_MODELS.items():
        for old, new in replacements.items():
            try:
                with engine.begin() as conn:
                    res = conn.execute(
                        text("UPDATE app_settings SET value = :new "
                             "WHERE key = :key AND value = :old"),
                        {"new": new, "key": key, "old": old},
                    )
                if res.rowcount:
                    log.warning("Migration: %s was set to the withdrawn model %s; "
                                "switched to %s", key, old, new)
            except Exception:
                log.exception("Migration failed retiring %s=%s", key, old)


def run_migrations() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    is_postgres = engine.dialect.name == "postgresql"
    with engine.begin() as conn:
        for table, column, ddl in _ADD_COLUMNS:
            if table not in tables:
                continue  # create_all will make it with the column
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column in existing:
                continue
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
                log.info("Migration: added %s.%s", table, column)
            except Exception:
                log.exception("Migration failed adding %s.%s", table, column)

        for name, table, columns in _ADD_INDEXES:
            if table not in tables:
                continue  # create_all will build it from the model
            try:
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({columns})"))
                log.info("Migration: ensured index %s", name)
            except Exception:
                log.exception("Migration failed creating index %s", name)

        if is_postgres:
            for table, column, pg_type in _WIDEN_COLUMNS:
                if table not in tables:
                    continue
                try:
                    conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE {pg_type}"))
                    log.info("Migration: widened %s.%s to %s", table, column, pg_type)
                except Exception:
                    log.exception("Migration failed widening %s.%s", table, column)

    # Full-text / substring search indexes for scale (Postgres only). Trigram GIN
    # indexes make the clause-library `ILIKE '%q%'` search and the contract
    # extracted-text search fast at 50k+ rows. SQLite needs no equivalent.
    if is_postgres:
        _create_trgm_indexes(tables)
        if "contracts" in tables:
            _create_vector_index()

    if "app_settings" in tables:
        _retire_withdrawn_models()

    # New enum labels for the pre-existing userrole type (Postgres native enum).
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction, so use autocommit.
    if is_postgres:
        for label in ("AUTHOR", "LEGAL", "APPROVER", "SUPER_ADMIN", "REQUESTER"):
            try:
                with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
                    c.execute(text(f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{label}'"))
                log.info("Migration: ensured userrole enum value %s", label)
            except Exception:
                log.exception("Migration failed adding userrole value %s", label)
