from datetime import date

from app.services.dates import days_to_expiry, derive_dates, parse_date, parse_tenure


class TestParseDate:
    def test_iso(self):
        assert parse_date("2025-04-01") == date(2025, 4, 1)

    def test_indian_dd_mm_yyyy(self):
        assert parse_date("01/04/2025") == date(2025, 4, 1)

    def test_verbose(self):
        assert parse_date("1st April 2025") == date(2025, 4, 1)

    def test_none_and_garbage(self):
        assert parse_date(None) is None
        assert parse_date("") is None
        assert parse_date("not a date") is None

    def test_passthrough_date(self):
        d = date(2024, 1, 1)
        assert parse_date(d) is d


class TestParseTenure:
    def test_years(self):
        delta = parse_tenure("3 years")
        assert delta.years == 3

    def test_months(self):
        delta = parse_tenure("18 months")
        # relativedelta normalizes 18 months to 1 year 6 months
        assert delta.years * 12 + delta.months == 18

    def test_combined(self):
        delta = parse_tenure("2 years 6 months")
        assert delta.years == 2 and delta.months == 6

    def test_word_numbers(self):
        assert parse_tenure("two years").years == 2

    def test_fractional_years(self):
        delta = parse_tenure("1.5 years")
        assert delta.years == 1 and delta.months == 6

    def test_unparseable(self):
        assert parse_tenure("perpetual") is None
        assert parse_tenure(None) is None


class TestDeriveDates:
    def test_end_from_start_plus_tenure(self):
        start, end, derived = derive_dates(date(2025, 1, 1), None, "1 year")
        assert start == date(2025, 1, 1)
        assert end == date(2025, 12, 31)  # inclusive end date
        assert derived == ["end_date"]

    def test_start_from_end_minus_tenure(self):
        start, end, derived = derive_dates(None, date(2025, 12, 31), "1 year")
        assert start == date(2025, 1, 1)
        assert derived == ["start_date"]

    def test_months_tenure(self):
        _, end, derived = derive_dates(date(2025, 1, 15), None, "6 months")
        assert end == date(2025, 7, 14)
        assert derived == ["end_date"]

    def test_both_dates_present_nothing_derived(self):
        start, end, derived = derive_dates(date(2025, 1, 1), date(2026, 1, 1), "1 year")
        assert (start, end) == (date(2025, 1, 1), date(2026, 1, 1))
        assert derived == []

    def test_no_tenure_no_derivation(self):
        start, end, derived = derive_dates(date(2025, 1, 1), None, None)
        assert end is None
        assert derived == []


class TestDaysToExpiry:
    def test_future(self):
        assert days_to_expiry(date(2025, 1, 31), today=date(2025, 1, 1)) == 30

    def test_past(self):
        assert days_to_expiry(date(2025, 1, 1), today=date(2025, 1, 11)) == -10

    def test_none(self):
        assert days_to_expiry(None) is None
