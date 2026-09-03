"""Date normalization and tenure-based derivation.

Rules (Module 2):
- All dates normalize to YYYY-MM-DD.
- If tenure is stated but end date is not, end_date = start_date + tenure (flagged derived).
- Vice versa: start_date = end_date - tenure.
"""
import re
from datetime import date, timedelta

from dateutil import parser as dateparser
from dateutil.relativedelta import relativedelta

_TENURE_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(year|yr|month|mon|week|wk|day)s?", re.IGNORECASE
)

_WORD_NUMBERS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
}


def parse_date(value) -> date | None:
    """Parse a date-ish value into a date; returns None when unparseable."""
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    text = str(value).strip()
    try:
        # Unambiguous ISO form first (extraction prompt asks for YYYY-MM-DD)
        return date.fromisoformat(text)
    except ValueError:
        pass
    try:
        # dayfirst=True: Indian documents typically use DD/MM/YYYY
        return dateparser.parse(text, dayfirst=True).date()
    except (ValueError, OverflowError):
        return None


def parse_tenure(tenure: str | None) -> relativedelta | None:
    """Parse tenure strings like '3 years', '18 months', '2 years 6 months'."""
    if not tenure:
        return None
    text = tenure.lower()
    for word, num in _WORD_NUMBERS.items():
        text = re.sub(rf"\b{word}\b", str(num), text)
    matches = _TENURE_RE.findall(text)
    if not matches:
        return None
    delta = relativedelta()
    for amount_s, unit in matches:
        amount = float(amount_s)
        unit = unit.lower()
        if unit in ("year", "yr"):
            whole = int(amount)
            delta += relativedelta(years=whole, months=round((amount - whole) * 12))
        elif unit in ("month", "mon"):
            whole = int(amount)
            delta += relativedelta(months=whole, days=round((amount - whole) * 30))
        elif unit in ("week", "wk"):
            delta += relativedelta(weeks=int(amount))
        elif unit == "day":
            delta += relativedelta(days=int(amount))
    return delta


def derive_dates(
    start_date: date | None, end_date: date | None, tenure: str | None
) -> tuple[date | None, date | None, list[str]]:
    """Fill in a missing start/end date from the tenure.

    Returns (start_date, end_date, derived_field_names). Contract end dates are
    conventionally inclusive, so a 1-year contract starting 2025-01-01 ends
    2025-12-31 (start + tenure - 1 day).
    """
    derived: list[str] = []
    delta = parse_tenure(tenure)
    if delta is None:
        return start_date, end_date, derived

    if start_date and not end_date:
        end_date = start_date + delta - relativedelta(days=1)
        derived.append("end_date")
    elif end_date and not start_date:
        start_date = end_date - delta + relativedelta(days=1)
        derived.append("start_date")
    return start_date, end_date, derived


def _format_months(total_months: int) -> str | None:
    """Format a whole number of months as 'N Years' when divisible by 12, else
    'N Months' — so tenure is always expressed in months or years."""
    if total_months <= 0:
        return None
    if total_months % 12 == 0:
        years = total_months // 12
        return f"{years} Year{'s' if years != 1 else ''}"
    return f"{total_months} Month{'s' if total_months != 1 else ''}"


def tenure_from_dates(start_date: date | None, end_date: date | None) -> str | None:
    """Compute contract tenure from the dates, in whole months or years. End
    dates are inclusive, so 2025-01-01 → 2025-12-31 is '1 Year'."""
    if not start_date or not end_date or end_date < start_date:
        return None
    span = relativedelta(end_date + timedelta(days=1), start_date)  # inclusive end
    total_months = span.years * 12 + span.months + (1 if span.days >= 15 else 0)
    return _format_months(total_months)


def normalize_tenure(tenure: str | None) -> str | None:
    """Normalize any tenure string to whole months or years (e.g. '18 months',
    '1.5 years', '2 years 6 months' → '18 Months' / '18 Months' / '30 Months')."""
    delta = parse_tenure(tenure)
    if delta is None:
        return None
    total_months = (delta.years or 0) * 12 + (delta.months or 0) + round(
        ((delta.weeks or 0) * 7 + (delta.days or 0)) / 30
    )
    return _format_months(total_months)


def days_to_expiry(end_date: date | None, today: date | None = None) -> int | None:
    if end_date is None:
        return None
    today = today or date.today()
    return (end_date - today).days
