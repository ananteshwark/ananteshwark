"""EXPLAIN ANALYZE the heaviest queries against a synthetic 50k-contract register.

Dev only. Builds a throwaway database, fills it, ANALYZEs, and prints the plan
and timing for the queries that carry the product: the contracts list, the
expiry sweep that runs on every list load, the nightly reminder scan, and a
whole-register report.

    createdb cms_scale
    DATABASE_URL=postgresql+psycopg2://postgres@127.0.0.1:5432/cms_scale \
      python scripts/bench_queries.py

Measured 2026-08 on 50,000 contracts / 2,000 vendors / 40 departments:

    contracts list (filter + sort + page)   0.96 ms   index scan on the pkey
    expiry sweep, first run after rollover 60.89 ms   1,415 rows updated
    expiry sweep, steady state              1.04 ms   0 rows updated
    reminder scan (nightly)                 5.47 ms   8,332 rows
    report_builder.run (5k rows)            4.78 ms   seq scan, still cheap

Two conclusions worth recording, because both say "do nothing":

  * No further indexes are warranted at this size. ix_contracts_expiry_scan
    (added when the sweep was a filter-heavy scan) serves both the sweep and
    the reminder scan; everything else is already sub-6ms.
  * The expiry sweep does NOT need the TTL it looked like it needed. It runs on
    every contracts page load, which sounds expensive, but only the first load
    after a day rolls over does any writing — every other call is a 1 ms index
    probe that finds nothing. Adding a TTL would have been optimising a
    measurement nobody took.
"""
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
os.environ["CMS_BACKGROUND_SERVICES"]="false"; os.environ["JWT_SECRET"]="x"*40
os.environ["ENV"]="development"
os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg2://postgres@127.0.0.1:5432/cms_scale")
from sqlalchemy import text

import app.models
from app.database import Base, engine

# Importing app.models is what registers the tables on Base; naming the count
# here keeps that dependency explicit rather than relying on an unused import.
TABLE_COUNT = len(app.models.Base.metadata.tables)

with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
    c.execute(text("DROP SCHEMA public CASCADE")); c.execute(text("CREATE SCHEMA public"))
Base.metadata.create_all(bind=engine)
from app.migrations import run_migrations
run_migrations()

with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
    c.execute(text("""
      INSERT INTO vendors (name, normalized_name, created_at)
      SELECT 'Vendor ' || i, 'vendor ' || i, now() FROM generate_series(1, 2000) i
    """))
    c.execute(text("""
      INSERT INTO departments (name, created_at) SELECT 'Dept ' || i, now() FROM generate_series(1, 40) i
    """))
    c.execute(text("""
      INSERT INTO contracts (contract_service, currency, legal_hold, reminders_acknowledged,
                             status, lifecycle_status, vendor_id, department_id,
                             contract_type, contract_value, start_date, end_date,
                             created_at, updated_at)
      SELECT 'Service ' || i, 'INR', false, false,
             (ARRAY['VALIDATED','PENDING_VALIDATION','REJECTED'])[1 + (i % 3)]::contractstatus,
             (ARRAY['ACTIVE','EXPIRED','TERMINATED','RENEWED'])[1 + (i % 4)]::lifecyclestatus,
             1 + (i % 2000), 1 + (i % 40),
             (ARRAY['MSA','NDA','SOW','Lease'])[1 + (i % 4)],
             (i % 500) * 1000,
             DATE '2024-01-01' + (i % 700),
             DATE '2026-01-01' + (i % 700),
             now(), now()
      FROM generate_series(1, 50000) i
    """))
    c.execute(text("ANALYZE"))

QUERIES = {
 "contracts list (filter + sort + page)": """
    SELECT c.* FROM contracts c
    WHERE c.deleted_at IS NULL AND c.status = 'VALIDATED'
      AND c.lifecycle_status IN ('ACTIVE','EXPIRED')
      AND c.contract_type IN ('MSA','SOW')
    ORDER BY c.sr_no DESC LIMIT 200 OFFSET 0""",
 "expiry sweep (runs on every list load)": """
    UPDATE contracts SET lifecycle_status='EXPIRED'
    WHERE status='VALIDATED' AND lifecycle_status='ACTIVE' AND deleted_at IS NULL
      AND end_date IS NOT NULL AND end_date < CURRENT_DATE""",
 "reminder scan (nightly)": """
    SELECT c.* FROM contracts c
    WHERE c.status IN ('VALIDATED') AND c.deleted_at IS NULL
      AND c.end_date IS NOT NULL
      AND c.lifecycle_status IN ('ACTIVE','EXPIRED')""",
 "report_builder.run (whole register)": """
    SELECT c.sr_no, c.contract_type, c.status, c.end_date, c.contract_value, c.currency,
           v.name, d.name
    FROM contracts c
    LEFT JOIN vendors v ON v.id = c.vendor_id
    LEFT JOIN departments d ON d.id = c.department_id
    WHERE c.deleted_at IS NULL LIMIT 5000""",
}

with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
    total = c.execute(text("SELECT count(*) FROM contracts")).scalar()
    print(f"contracts: {total}\n")
    for name, q in QUERIES.items():
        rows = list(c.execute(text("EXPLAIN (ANALYZE, BUFFERS) " + q)))
        plan = [r[0] for r in rows]
        timing = [l for l in plan if l.startswith("Execution Time") or l.startswith("Planning Time")]
        scans = [l.strip() for l in plan if "Scan" in l][:3]
        print(f"--- {name}")
        for s in scans: print("   ", s[:120])
        for t in timing: print("   ", t)
        print()
