"""Expiry reminder engine (Module 6).

Pure offset logic lives in `is_reminder_due` (unit-tested); `run_daily_check`
evaluates every VALIDATED, non-archived contract against its applicable rule.
"""
import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    Contract,
    ContractStatus,
    Department,
    EmailTemplate,
    LifecycleStatus,
    ReminderLog,
    ReminderRule,
    RuleDepartmentMap,
)
from .notifications import get_channel

log = logging.getLogger(__name__)

DEFAULT_TEMPLATE_SUBJECT = "[CMS] Contract with {vendor} expires in {days_remaining} day(s)"
DEFAULT_TEMPLATE_BODY = """
<p>This is a reminder that the following contract is approaching expiry:</p>
<ul>
  <li><b>Vendor:</b> {vendor}</li>
  <li><b>Signing entity:</b> {signing_entity}</li>
  <li><b>Department:</b> {department}</li>
  <li><b>Contract service:</b> {contract_service}</li>
  <li><b>PO number:</b> {po_number}</li>
  <li><b>Contract value:</b> {currency} {contract_value}</li>
  <li><b>End date:</b> {end_date}</li>
  <li><b>Days remaining:</b> {days_remaining}</li>
</ul>
<p><b>Action needed:</b> <a href="{renewal_link}">Renew or terminate this contract</a> — no login required.</p>
<p><a href="{contract_url}">Open contract record</a> &middot; <a href="{document_link}">Contract document</a></p>
"""


def is_reminder_due(
    days_remaining: int,
    offsets: list[int],
    periodicity_days: int | None = None,
    post_expiry_days: int | None = None,
) -> bool:
    """Decide whether a reminder fires today.

    - Fires on each explicit offset (days before expiry).
    - After the first (largest) offset has passed, fires every `periodicity_days`
      until expiry.
    - After expiry, fires every `post_expiry_days` (caller stops these once the
      contract is acknowledged/renewed/terminated).
    """
    offsets = sorted({int(o) for o in offsets or []}, reverse=True)

    if days_remaining >= 0:
        if days_remaining in offsets:
            return True
        if periodicity_days and offsets:
            first = offsets[0]
            if days_remaining < first and (first - days_remaining) % periodicity_days == 0:
                return True
        return False

    # Past expiry
    if post_expiry_days:
        overdue = -days_remaining
        return overdue % post_expiry_days == 0
    return False


def upcoming_reminder_dates(
    end_date,
    offsets: list[int],
    periodicity_days: int | None = None,
    post_expiry_days: int | None = None,
    from_date=None,
    horizon_days: int = 400,
    max_dates: int = 60,
):
    """The dates on which a reminder would fire for a contract, from `from_date`
    forward. Uses the same `is_reminder_due` logic the scheduler runs daily."""
    from datetime import date as _date
    from datetime import timedelta

    if end_date is None or not offsets:
        return []
    from_date = from_date or _date.today()
    last = end_date + timedelta(days=horizon_days if post_expiry_days else 0)
    dates = []
    day = from_date
    while day <= last and len(dates) < max_dates:
        days_remaining = (end_date - day).days
        if days_remaining < 0 and not post_expiry_days:
            break
        if is_reminder_due(days_remaining, offsets, periodicity_days, post_expiry_days):
            dates.append(day)
        day += timedelta(days=1)
    return dates


def resolve_rule(db: Session, contract: Contract) -> ReminderRule | None:
    """Per-contract rule override wins; otherwise the department's mapped rule."""
    if contract.reminder_rule_id is not None:
        rule = db.get(ReminderRule, contract.reminder_rule_id)
        if rule is not None and rule.deleted_at is None:
            return rule
    if contract.department_id is not None:
        mapping = (
            db.query(RuleDepartmentMap)
            .filter(RuleDepartmentMap.department_id == contract.department_id)
            .first()
        )
        if mapping is not None:
            rule = db.get(ReminderRule, mapping.rule_id)
            if rule is not None and rule.deleted_at is None:
                return rule
    return None


def resolve_recipients(db: Session, contract: Contract) -> tuple[list[str], str | None]:
    """Returns (recipient_emails, primary_email). Falls back to department default."""
    recipients = [
        r for r in contract.recipients if r.deleted_at is None
    ] if contract.recipients else []
    emails = [r.email for r in recipients]
    primary = next((r.email for r in recipients if r.is_primary), emails[0] if emails else None)
    if not emails and contract.department_id:
        dept = db.get(Department, contract.department_id)
        if dept and dept.default_recipient_email:
            emails = [e.strip() for e in dept.default_recipient_email.replace("\n", ",").split(",") if e.strip()]
            primary = emails[0] if emails else None
    return emails, primary


def _render(template: str, context: dict) -> str:
    out = template
    for key, value in context.items():
        out = out.replace("{" + key + "}", str(value if value is not None else "—"))
    return out


def send_contract_reminder(
    db: Session, contract: Contract, rule: ReminderRule | None, days_remaining: int
) -> None:
    emails, _ = resolve_recipients(db, contract)
    if not emails:
        db.add(
            ReminderLog(
                contract_id=contract.sr_no,
                rule_id=rule.id if rule else None,
                recipient="(none configured)",
                days_to_expiry=days_remaining,
                delivery_status="SKIPPED",
                detail="No reminder recipients configured for contract or department",
            )
        )
        return

    # Escalation: after N un-acknowledged reminders, CC the escalation contact.
    # Per-contract overrides win over the resolved rule's defaults.
    esc_after = (
        contract.escalation_after
        if contract.escalation_after is not None
        else (rule.escalation_after if rule else None)
    )
    esc_email = contract.escalation_email or (rule.escalation_email if rule else None)
    cc: list[str] = []
    escalated = False
    if esc_after and esc_email:
        prior = (
            db.query(ReminderLog)
            .filter(ReminderLog.contract_id == contract.sr_no)
            .filter(ReminderLog.delivery_status == "SENT")
            .count()
        )
        if prior >= esc_after and not contract.reminders_acknowledged:
            cc = [esc_email]
            escalated = True

    template = db.query(EmailTemplate).filter(EmailTemplate.name == "expiry_reminder").first()
    subject_tpl = template.subject if template else DEFAULT_TEMPLATE_SUBJECT
    body_tpl = template.body if template else DEFAULT_TEMPLATE_BODY

    dept = db.get(Department, contract.department_id) if contract.department_id else None
    context = {
        "vendor": contract.vendor.name if contract.vendor else contract.vendor_name_raw,
        "signing_entity": contract.signing_entity,
        "department": dept.name if dept else None,
        "contract_service": contract.contract_service,
        "po_number": contract.po_number,
        "contract_value": contract.contract_value,
        "currency": contract.currency,
        "end_date": contract.end_date,
        "days_remaining": days_remaining,
        "contract_url": f"{settings.APP_BASE_URL}/contracts/{contract.sr_no}",
        "document_link": contract.contract_link,
    }
    # No-login renew/terminate link the recipient can act on straight from email.
    from .contract_actions import mint_token
    tok = mint_token(db, contract)
    context["renewal_link"] = f"{settings.APP_BASE_URL}/contract-action/{tok.token}"
    subject = _render(subject_tpl, context)
    body = _render(body_tpl, context)

    channels = (rule.channels if rule and rule.channels else ["email"])
    for channel_name in channels:
        channel = get_channel(channel_name)
        status_, detail = "SENT", None
        if channel is None:
            status_, detail = "SKIPPED", f"Channel '{channel_name}' not available"
        else:
            try:
                channel.send(emails, subject, body, cc=cc)
            except Exception as exc:  # log failure, keep the daily run going
                status_, detail = "FAILED", str(exc)
                log.exception("Reminder send failed for contract %s", contract.sr_no)
        for email in emails:
            db.add(
                ReminderLog(
                    contract_id=contract.sr_no,
                    rule_id=rule.id if rule else None,
                    recipient=email,
                    channel=channel_name,
                    days_to_expiry=days_remaining,
                    escalated=escalated,
                    delivery_status=status_,
                    detail=detail,
                )
            )


def run_daily_check(db: Session, today: date | None = None) -> int:
    """Evaluate every eligible contract; returns the number of reminders fired."""
    if today is None:
        today = datetime.now(ZoneInfo(settings.TIMEZONE)).date()

    # Flip any past-end-date contract to EXPIRED first, so contracts without a
    # reminder rule still transition their lifecycle status.
    from .lifecycle import sweep_expired
    sweep_expired(db, today)

    # Nudge vendors whose review due date is approaching (best-effort).
    try:
        from .collaboration import nudge_due_links
        nudge_due_links(db)
    except Exception:
        log.exception("Vendor due-date nudge failed")

    # Proactively draft renewals for contracts nearing expiry (opt-in).
    try:
        from .contract_actions import auto_draft_due_renewals
        from .settings_store import get_setting
        if get_setting(db, "auto_renewal_enabled") == "true":
            lead = int(get_setting(db, "auto_renewal_lead_days") or 60)
            n = auto_draft_due_renewals(db, today, lead)
            if n:
                log.info("Auto-created %d renewal draft(s)", n)
    except Exception:
        log.exception("Auto-renewal drafting failed")

    contracts = (
        db.query(Contract)
        .filter(Contract.status == ContractStatus.VALIDATED)
        .filter(Contract.deleted_at.is_(None))
        .filter(Contract.end_date.isnot(None))
        # Renewed/terminated contracts stop reminding automatically
        .filter(Contract.lifecycle_status.in_([LifecycleStatus.ACTIVE, LifecycleStatus.EXPIRED]))
        .all()
    )
    fired = 0
    for contract in contracts:
        # Snoozed contracts are skipped until their snooze date passes
        if contract.reminders_snoozed_until and today < contract.reminders_snoozed_until:
            continue

        days_remaining = (contract.end_date - today).days
        if days_remaining < 0 and contract.reminders_acknowledged:
            continue

        rule = resolve_rule(db, contract)
        offsets = contract.custom_offsets or (rule.offsets if rule else None)
        if not offsets:
            continue
        periodicity = rule.periodicity_days if rule else None
        post_expiry = rule.post_expiry_days if rule else None

        if is_reminder_due(days_remaining, offsets, periodicity, post_expiry):
            send_contract_reminder(db, contract, rule, days_remaining)
            fired += 1
            # In-app notification for the contract's owner, if assigned
            if contract.assignee_id:
                from .user_notifications import create_notification
                when = (
                    f"expires in {days_remaining} day(s)" if days_remaining >= 0
                    else f"expired {-days_remaining} day(s) ago"
                )
                create_notification(
                    db, contract.assignee_id, "reminder",
                    f"Contract #{contract.sr_no} {when}", f"/contracts/{contract.sr_no}",
                )

        # Keep lifecycle status in sync
        if days_remaining < 0 and contract.lifecycle_status == LifecycleStatus.ACTIVE:
            contract.lifecycle_status = LifecycleStatus.EXPIRED
    db.commit()

    # Obligation reminders (F2): the register's due dates chase themselves too.
    try:
        from .obligation_reminders import run_obligation_reminders
        run_obligation_reminders(db, today)
    except Exception:
        log.exception("Obligation reminder run failed")

    log.info("Daily reminder run for %s: %d contract(s) reminded", today, fired)
    return fired
