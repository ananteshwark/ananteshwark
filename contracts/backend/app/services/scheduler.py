"""APScheduler-based daily reminder scheduler (Asia/Kolkata)."""
import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import settings
from ..database import SessionLocal
from .digest import digest_enabled, send_digest
from .reminders import run_daily_check
from .settings_store import get_setting

log = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None
_JOB_ID = "daily-reminder-check"
_DIGEST_JOB_ID = "scheduled-digest"


def _job():
    db = SessionLocal()
    try:
        run_daily_check(db)
    except Exception:
        log.exception("Daily reminder run failed")
    try:
        from .report_delivery import run_due_reports
        run_due_reports(db)
    except Exception:
        log.exception("Scheduled report delivery failed")
    finally:
        db.close()


def _digest_job():
    db = SessionLocal()
    try:
        if digest_enabled(db):
            send_digest(db)
    except Exception:
        log.exception("Scheduled digest run failed")
    finally:
        db.close()


def _parse_hhmm(raw: str, default: tuple[int, int]) -> tuple[int, int]:
    try:
        hour_s, minute_s = raw.split(":")
        return int(hour_s), int(minute_s)
    except (ValueError, AttributeError):
        return default


def _run_time() -> tuple[int, int]:
    db = SessionLocal()
    try:
        raw = get_setting(db, "reminder_run_time") or settings.REMINDER_RUN_TIME
    finally:
        db.close()
    return _parse_hhmm(raw, (8, 0))


def _digest_trigger(tz) -> CronTrigger:
    db = SessionLocal()
    try:
        time_raw = get_setting(db, "digest_time")
        frequency = get_setting(db, "digest_frequency")
        dow_raw = get_setting(db, "digest_day_of_week")
    finally:
        db.close()
    hour, minute = _parse_hhmm(time_raw, (8, 0))
    if frequency == "weekly":
        try:
            dow = max(0, min(6, int(dow_raw)))
        except (ValueError, TypeError):
            dow = 0
        # APScheduler day_of_week: 0=Mon … 6=Sun (matches our setting)
        return CronTrigger(day_of_week=dow, hour=hour, minute=minute, timezone=tz)
    return CronTrigger(hour=hour, minute=minute, timezone=tz)


def start_scheduler() -> BackgroundScheduler:
    global _scheduler
    tz = ZoneInfo(settings.TIMEZONE)
    _scheduler = BackgroundScheduler(timezone=tz)
    hour, minute = _run_time()
    _scheduler.add_job(_job, CronTrigger(hour=hour, minute=minute, timezone=tz), id=_JOB_ID)
    _scheduler.add_job(_digest_job, _digest_trigger(tz), id=_DIGEST_JOB_ID)
    _scheduler.start()
    log.info("Reminder scheduler started (daily at %02d:%02d %s)", hour, minute, settings.TIMEZONE)
    return _scheduler


def reschedule():
    """Apply an admin change to the daily run time."""
    if _scheduler is None:
        return
    tz = ZoneInfo(settings.TIMEZONE)
    hour, minute = _run_time()
    _scheduler.reschedule_job(_JOB_ID, trigger=CronTrigger(hour=hour, minute=minute, timezone=tz))
    log.info("Reminder run time updated to %02d:%02d %s", hour, minute, settings.TIMEZONE)


def reschedule_digest():
    """Apply an admin change to the digest schedule (frequency / day / time)."""
    if _scheduler is None:
        return
    _scheduler.reschedule_job(_DIGEST_JOB_ID, trigger=_digest_trigger(ZoneInfo(settings.TIMEZONE)))
    log.info("Digest schedule updated")


def jobs_status() -> list[dict]:
    """Next-run time (ISO, app timezone) for each scheduled job, for the
    admin System Status panel. Empty when the scheduler isn't running."""
    if _scheduler is None:
        return []
    labels = {_JOB_ID: "Daily reminder check", _DIGEST_JOB_ID: "Scheduled digest"}
    out = []
    for job in _scheduler.get_jobs():
        nxt = job.next_run_time
        out.append({
            "id": job.id,
            "label": labels.get(job.id, job.id),
            "next_run": nxt.isoformat() if nxt else None,
        })
    return out


def stop_scheduler():
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
