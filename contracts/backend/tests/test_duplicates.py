from datetime import date

from app.services.duplicates import ContractFacts, check_pair, dates_overlap, find_duplicates
from app.services.vendor_matching import normalize_vendor_name, vendor_similarity


def facts(**kwargs) -> ContractFacts:
    defaults = dict(
        sr_no=None, vendor_name=None, signing_entity=None, po_number=None,
        contract_service=None, start_date=None, end_date=None,
    )
    defaults.update(kwargs)
    return ContractFacts(**defaults)


class TestVendorNormalization:
    def test_strips_suffixes(self):
        assert normalize_vendor_name("Acme Pvt Ltd") == "acme"
        assert normalize_vendor_name("Acme Private Limited") == "acme"
        assert normalize_vendor_name("Acme LLP") == "acme"
        assert normalize_vendor_name("Acme, Inc.") == "acme"

    def test_similarity_ignores_suffix_differences(self):
        assert vendor_similarity("Acme Technologies Pvt Ltd", "ACME Technologies LLP") >= 90

    def test_different_vendors_score_low(self):
        assert vendor_similarity("Acme Technologies", "Zenith Logistics") < 90


class TestRuleA_SamePo:
    def test_same_vendor_same_po_is_duplicate(self):
        a = facts(sr_no=1, vendor_name="Acme Pvt Ltd", po_number="PO-1234")
        b = facts(sr_no=2, vendor_name="Acme Private Limited", po_number="po 1234")
        is_dup, reason, score = check_pair(a, b)
        assert is_dup
        assert "PO number" in reason
        assert score >= 90

    def test_same_vendor_different_po_not_duplicate(self):
        a = facts(sr_no=1, vendor_name="Acme Ltd", po_number="PO-1234")
        b = facts(sr_no=2, vendor_name="Acme Ltd", po_number="PO-9999")
        assert not check_pair(a, b)[0]

    def test_different_vendor_same_po_not_duplicate(self):
        a = facts(sr_no=1, vendor_name="Acme Ltd", po_number="PO-1234")
        b = facts(sr_no=2, vendor_name="Zenith Logistics", po_number="PO-1234")
        assert not check_pair(a, b)[0]

    def test_missing_po_does_not_match_missing_po(self):
        a = facts(sr_no=1, vendor_name="Acme Ltd", po_number=None)
        b = facts(sr_no=2, vendor_name="Acme Ltd", po_number=None)
        assert not check_pair(a, b)[0]


class TestRuleB_OverlapAndService:
    def _pair(self, **overrides):
        base = dict(
            vendor_name="Acme Pvt Ltd",
            signing_entity="IKS Health",
            contract_service="Housekeeping services",
            start_date=date(2025, 1, 1),
            end_date=date(2025, 12, 31),
        )
        a = facts(sr_no=1, **base)
        base.update(overrides)
        b = facts(sr_no=2, **base)
        return a, b

    def test_full_match_is_duplicate(self):
        a, b = self._pair(start_date=date(2025, 6, 1), end_date=date(2026, 5, 31))
        is_dup, reason, _ = check_pair(a, b)
        assert is_dup
        assert "overlapping" in reason

    def test_non_overlapping_dates_not_duplicate(self):
        a, b = self._pair(start_date=date(2026, 1, 1), end_date=date(2026, 12, 31))
        assert not check_pair(a, b)[0]

    def test_different_service_not_duplicate(self):
        a, b = self._pair(contract_service="Security guarding")
        assert not check_pair(a, b)[0]

    def test_different_signing_entity_not_duplicate(self):
        a, b = self._pair(signing_entity="Other Corp")
        assert not check_pair(a, b)[0]

    def test_different_contract_type_not_duplicate(self):
        a, b = self._pair()
        a.contract_type, b.contract_type = "NDA", "MSA"
        assert not check_pair(a, b)[0]

    def test_same_contract_type_is_duplicate(self):
        a, b = self._pair()
        a.contract_type, b.contract_type = "MSA", "msa"  # case-insensitive
        assert check_pair(a, b)[0]

    def test_missing_contract_type_is_compatible(self):
        a, b = self._pair()
        a.contract_type, b.contract_type = None, "MSA"  # unknown never blocks
        assert check_pair(a, b)[0]

    def test_different_location_not_duplicate(self):
        a, b = self._pair()
        a.location, b.location = "Mumbai", "Bengaluru"  # distinct sites -> not a dup
        assert not check_pair(a, b)[0]

    def test_same_location_is_duplicate(self):
        a, b = self._pair()
        a.location, b.location = "Mumbai Office", "mumbai office"  # same, case-insensitive
        assert check_pair(a, b)[0]

    def test_missing_location_is_compatible(self):
        a, b = self._pair()
        a.location, b.location = None, "Pune"  # unknown never blocks
        assert check_pair(a, b)[0]


class TestDatesOverlap:
    def test_overlap(self):
        assert dates_overlap(date(2025, 1, 1), date(2025, 6, 30), date(2025, 6, 1), date(2025, 12, 31))

    def test_no_overlap(self):
        assert not dates_overlap(date(2025, 1, 1), date(2025, 5, 31), date(2025, 6, 1), date(2025, 12, 31))

    def test_open_ended_overlaps(self):
        assert dates_overlap(date(2025, 1, 1), None, date(2030, 1, 1), date(2030, 12, 31))

    def test_both_missing_no_overlap(self):
        assert not dates_overlap(None, None, date(2025, 1, 1), date(2025, 12, 31))


class TestFindDuplicates:
    def test_excludes_self_and_returns_all_hits(self):
        target = facts(sr_no=1, vendor_name="Acme Ltd", po_number="PO-1")
        existing = [
            facts(sr_no=1, vendor_name="Acme Ltd", po_number="PO-1"),   # self
            facts(sr_no=2, vendor_name="Acme Pvt Ltd", po_number="PO-1"),
            facts(sr_no=3, vendor_name="Zenith", po_number="PO-1"),
        ]
        hits = find_duplicates(target, existing)
        assert [h[0].sr_no for h in hits] == [2]
