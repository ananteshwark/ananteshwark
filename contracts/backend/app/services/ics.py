"""Pure iCalendar (RFC 5545) generation for contract expiration events.

Kept dependency-free and side-effect-free so it can be unit-tested; the API
layer turns contract rows into events and wraps the output in a response.
"""
from datetime import date, datetime, timedelta, timezone


def _escape(text: str) -> str:
    """Escape TEXT values per RFC 5545 §3.3.11."""
    return (
        (text or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def _fold(line: str) -> str:
    """Fold a content line to <=75 octets, continuation lines start with a space."""
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return line
    out = []
    chunk = b""
    for ch in line:
        b = ch.encode("utf-8")
        # leave room; first line 75, continuation lines 74 (leading space)
        limit = 75 if not out else 74
        if len(chunk) + len(b) > limit:
            out.append(chunk.decode("utf-8"))
            chunk = b
        else:
            chunk += b
    out.append(chunk.decode("utf-8"))
    return "\r\n ".join(out)


def build_calendar(events: list[dict], name: str = "Contract expirations", now: datetime | None = None) -> str:
    """Build a VCALENDAR string from events.

    Each event dict: {uid, date (datetime.date), summary, description (optional)}.
    Events are rendered as all-day VEVENTs on their date.
    """
    now = now or datetime.now(timezone.utc)
    dtstamp = now.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//CMS//Contract Management System//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape(name)}",
    ]
    for ev in events:
        d: date = ev["date"]
        lines.append("BEGIN:VEVENT")
        lines.append(f"UID:{ev['uid']}")
        lines.append(f"DTSTAMP:{dtstamp}")
        lines.append(f"DTSTART;VALUE=DATE:{d.strftime('%Y%m%d')}")
        # All-day event: DTEND is the exclusive next day.
        lines.append(f"DTEND;VALUE=DATE:{(d + timedelta(days=1)).strftime('%Y%m%d')}")
        lines.append(f"SUMMARY:{_escape(ev.get('summary', ''))}")
        if ev.get("description"):
            lines.append(f"DESCRIPTION:{_escape(ev['description'])}")
        lines.append("TRANSP:TRANSPARENT")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(ln) for ln in lines) + "\r\n"
