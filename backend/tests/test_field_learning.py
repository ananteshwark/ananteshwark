"""Unit tests for the validated-history learning layer."""
from datetime import date


def _setup():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from app.database import Base
    from app import models

    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    return Session(), models


def _mk(db, m, status=None, **kw):
    status = status or m.ContractStatus.VALIDATED
    c = m.Contract(status=status, raw_extracted={}, confidence={}, **kw)
    db.add(c)
    db.flush()
    return c


class TestFieldStats:
    def test_picks_modal_value_with_confidence(self):
        from app.services.field_learning import field_stats

        db, m = _setup()
        rows = [
            _mk(db, m, vendor_id=1, payment_term="Net 30"),
            _mk(db, m, vendor_id=1, payment_term="net 30"),   # case-insensitive match
            _mk(db, m, vendor_id=1, payment_term="Net 45"),
            _mk(db, m, vendor_id=1, payment_term=None),        # ignored
        ]
        stats = field_stats(rows, "payment_term")
        assert stats["value"] == "Net 30"     # representative original casing
        assert stats["support"] == 2
        assert stats["total"] == 3            # None is not counted
        assert stats["confidence"] == round(2 / 3, 3)

    def test_returns_none_when_no_values(self):
        from app.services.field_learning import field_stats
        db, m = _setup()
        rows = [_mk(db, m, vendor_id=1, payment_term=None)]
        assert field_stats(rows, "payment_term") is None


class TestSuggestions:
    def test_suggests_confident_fields_and_skips_matches(self):
        from app.services.field_learning import suggest_for_contract

        db, m = _setup()
        dept = m.Department(name="IT")
        db.add(dept)
        db.flush()
        # Three validated contracts for vendor 1, consistent department + entity.
        for _ in range(3):
            _mk(db, m, vendor_id=1, department_id=dept.id, signing_entity="TruBridge",
                contract_type="MSA")
        # New pending contract for the same vendor: entity already correct (skip),
        # department + type blank (suggest).
        target = _mk(db, m, status=m.ContractStatus.PENDING_VALIDATION,
                     vendor_id=1, signing_entity="TruBridge")
        db.commit()

        sugg = suggest_for_contract(db, target)
        assert "department_id" in sugg and sugg["department_id"]["suggested"] == dept.id
        assert "contract_type" in sugg and sugg["contract_type"]["suggested"] == "MSA"
        # signing_entity already matches history -> not suggested
        assert "signing_entity" not in sugg

    def test_no_suggestions_without_enough_history(self):
        from app.services.field_learning import suggest_for_contract
        db, m = _setup()
        _mk(db, m, vendor_id=1, contract_type="MSA")   # only one -> below min_support
        target = _mk(db, m, status=m.ContractStatus.PENDING_VALIDATION, vendor_id=1)
        db.commit()
        assert suggest_for_contract(db, target) == {}


class TestAutofill:
    def test_fills_only_empty_fields(self):
        from app.services.field_learning import autofill_from_history

        db, m = _setup()
        for _ in range(3):
            _mk(db, m, vendor_id=7, contract_type="NDA", payment_term="Net 30")
        # Target already has a contract_type (must not be overwritten); payment_term blank.
        target = _mk(db, m, status=m.ContractStatus.PENDING_VALIDATION,
                     vendor_id=7, contract_type="SOW")
        db.commit()

        filled = autofill_from_history(db, target)
        assert "payment_term" in filled
        assert "contract_type" not in filled       # existing value preserved
        assert target.payment_term == "Net 30"
        assert target.contract_type == "SOW"
