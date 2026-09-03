"""List endpoints must not issue work proportional to the number of rows.

contract_out() reads c.vendor, c.department, c.assignee and c.tags, all of
which are lazy relationships. Serializing a page therefore used to fire four
extra round trips per row: 106 SQL statements for a 50-row page, and the
default page size is 200. Nothing failed — it just got slower in proportion to
how much data the customer had, which is the kind of regression that reappears
the moment someone adds a field to the serializer.

The other two list paths — the vendor register and a built report — were
measured and are already constant. Their tests are guards, not fixes: both
serialize relationships, so both are one accessor away from the same defect.

These pin the shape rather than an exact number: the statement count must not
grow with the number of rows. A reintroduced N+1 fails them immediately.

Measuring correctly is fiddly in two ways this harness handles, and both
produced a wrong answer of exactly 0 while being written:

  * `return len(seen), fn()` evaluates the count *before* calling fn.
  * A session that seeded the rows already holds them in its identity map, so
    nothing is re-fetched. Anything measured must run on a fresh session.
"""
from sqlalchemy import event

from app.database import SessionLocal, engine
from app.models import (
    Contract, ContractStatus, Department, LifecycleStatus, Tag, Vendor,
)


def _seed(n, prefix):
    """Every contract gets its *own* vendor, department and tag.

    Sharing them would make this measure nothing: a lazy load of the same
    Department for all fifty rows hits the identity map after the first and
    costs one query, so an N+1 would look constant. Distinct parents are what
    make a per-row load show up as per-row work.
    """
    db = SessionLocal()
    for i in range(n):
        v = Vendor(name=f"{prefix}-v{i}", normalized_name=f"{prefix}-v{i}")
        d = Department(name=f"{prefix}-dept{i}")
        t = Tag(name=f"{prefix}-tag{i}", color="#abcdef")
        db.add_all([v, d, t]); db.flush()
        c = Contract(
            vendor_id=v.id, vendor_name_raw=v.name, contract_service="svc",
            department_id=d.id, contract_type=f"{prefix}-type",
            status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
            raw_extracted={}, confidence={},
        )
        c.tags.append(t)
        db.add(c)
    db.commit(); db.close()


def _count_statements(fn):
    seen = []

    def listen(*_a, **_k):
        seen.append(1)

    event.listen(engine, "before_cursor_execute", listen)
    try:
        result = fn()
    finally:
        event.remove(engine, "before_cursor_execute", listen)
    return len(seen), result


def test_list_query_count_does_not_grow_with_page_size(client, admin_headers):
    _seed(10, "qc-small")
    small, r1 = _count_statements(
        lambda: client.get("/api/contracts?contract_type=qc-small-type&limit=10",
                           headers=admin_headers))
    assert r1.status_code == 200, r1.text
    assert len(r1.json()["items"]) == 10

    _seed(40, "qc-large")
    large, r2 = _count_statements(
        lambda: client.get("/api/contracts?contract_type=qc-large-type&limit=40",
                           headers=admin_headers))
    assert r2.status_code == 200, r2.text
    assert len(r2.json()["items"]) == 40

    # Four-times the rows must not mean four-times the queries. Allow a couple
    # of statements of slack for per-request bookkeeping, but nothing that
    # scales: an N+1 here would be 30 extra statements at minimum.
    assert large <= small + 2, (
        f"query count grew with page size: {small} statements for 10 rows, "
        f"{large} for 40 — a lazy relationship in contract_out() is being "
        f"loaded per row"
    )


def test_vendor_list_query_count_does_not_grow(client, admin_headers):
    """The vendor register serializes per-vendor contract counts and aliases."""
    _seed(10, "qcv-small")
    small, r1 = _count_statements(
        lambda: client.get("/api/vendors?limit=10", headers=admin_headers))
    assert r1.status_code == 200, r1.text

    _seed(40, "qcv-large")
    large, r2 = _count_statements(
        lambda: client.get("/api/vendors?limit=50", headers=admin_headers))
    assert r2.status_code == 200, r2.text

    assert large <= small + 2, (
        f"query count grew with the vendor count: {small} statements for 10, "
        f"{large} for 50")


def test_report_builder_run_query_count_does_not_grow():
    """run_report reads department, vendor and tags for every row. It defers the
    document body and eager-loads the three accessors that leave the row; drop
    any of those and this fails.

    Measured on a session that did not seed the rows — a seeding session already
    holds them and reports 0 queries no matter what the code does.
    """
    from app.services.report_builder import DEFAULT_COLUMNS, run_report

    class Definition:
        columns = list(DEFAULT_COLUMNS)
        filters = {}
        sort = None

    _seed(10, "qcr-small")
    db = SessionLocal()
    small, first = _count_statements(lambda: run_report(db, Definition()))
    db.close()
    assert first["total"] >= 10

    _seed(40, "qcr-large")
    db = SessionLocal()
    large, second = _count_statements(lambda: run_report(db, Definition()))
    db.close()
    # The second run must actually be bigger, or the comparison proves nothing.
    assert second["total"] > first["total"], (first["total"], second["total"])

    assert large <= small + 2, (
        f"query count grew with the report size: {small} statements for "
        f"{first['total']} rows, {large} for {second['total']}")
