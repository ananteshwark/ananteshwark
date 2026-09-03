from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ..audit import log_action
from ..auth import require_admin, require_viewer
from ..database import get_db
from ..models import EmailTemplate, PromptTemplate, User
from ..schemas import EmailTemplateIn, EmailTestRequest, PromptIn, SettingsUpdate
from ..services.settings_store import DEFAULTS, MASK, SECRET_KEYS, all_settings, get_setting, set_setting

router = APIRouter(prefix="/settings", tags=["settings"])

_ALLOWED_KEYS = set(DEFAULTS.keys())


@router.get("")
def get_settings(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    # Secrets (API key, SMTP password) are masked — write-only via PUT
    return all_settings(db)


@router.put("")
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    unknown = set(payload.values) - _ALLOWED_KEYS
    if unknown:
        raise HTTPException(400, f"Unknown settings: {', '.join(sorted(unknown))}")
    old = all_settings(db, mask_secrets=False)
    for key, value in payload.values.items():
        if key in SECRET_KEYS and value == MASK:
            continue  # unchanged masked secret — keep the stored value
        set_setting(db, key, value)
        if old.get(key) != value:
            is_secret = key in SECRET_KEYS
            log_action(db, "settings", 0, "UPDATE", user_id=user.id, field=key,
                       old_value=MASK if is_secret and old.get(key) else old.get(key),
                       new_value=MASK if is_secret and value else value)
    db.commit()

    # Apply live: restart watcher(s) / reschedule reminder job as needed
    from .. import runtime
    if runtime.watcher_instance is not None and (
        {"watch_roots", "supported_extensions", "file_stability_seconds", "watch_enabled"}
        & set(payload.values)
    ):
        runtime.watcher_instance.restart()
    if runtime.gdrive_watcher_instance is not None and (
        {"gdrive_enabled", "gdrive_folder_ids", "gdrive_credentials_json",
         "gdrive_poll_seconds", "gdrive_staging_dir", "supported_extensions"}
        & set(payload.values)
    ):
        runtime.gdrive_watcher_instance.restart()
    if "extraction_enabled" in payload.values:
        from ..services.extraction_worker import set_extraction_enabled
        set_extraction_enabled(payload.values["extraction_enabled"] != "false")
    if "reminder_run_time" in payload.values:
        from ..services.scheduler import reschedule
        reschedule()
    if {"digest_frequency", "digest_day_of_week", "digest_time"} & set(payload.values):
        from ..services.scheduler import reschedule_digest
        reschedule_digest()
    return all_settings(db)


@router.post("/email-test")
def email_test(payload: EmailTestRequest, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Send a test email using the current SMTP settings (respects dry-run)."""
    from ..services.notifications import get_channel

    channel = get_channel("email")
    if channel is None:
        raise HTTPException(400, "Email channel is not available")
    try:
        channel.send(
            [str(payload.to)],
            "[CMS] Test email",
            "<p>This is a test email from the Contract Management System. "
            "If you received it, your SMTP settings are working.</p>",
        )
    except Exception as exc:
        raise HTTPException(400, f"Send failed: {exc}")
    dry_run = get_setting(db, "email_dry_run") == "true"
    return {"ok": True, "dry_run": dry_run,
            "detail": "Dry-run mode is on — the email was logged, not sent." if dry_run else "Test email sent."}


@router.post("/ai-test")
def ai_test(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Call the configured AI provider once and report what came back.

    Every AI feature falls back silently when the provider fails, which is the
    right behaviour for the feature and leaves an administrator with no way to
    tell a wrong key from a retired model from a blocked network. This is the
    equivalent of the "send test email" button for the model.
    """
    from ..services.ai_diagnostics import probe_provider

    result = probe_provider(db)
    log_action(db, "settings", 0, "AI_TEST", user_id=user.id,
               new_value=f"{result['provider']}/{result['model']}: "
                         f"{'ok' if result['ok'] else result['error']}"[:500])
    db.commit()
    return result


@router.get("/system-status")
def system_status(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Operational snapshot of the background services for the admin panel:
    which ingestion sources are enabled and currently running, and when the
    scheduled jobs (reminders, digest) will next fire."""
    from .. import runtime
    from ..services.scheduler import jobs_status

    watcher = runtime.watcher_instance
    gdrive = runtime.gdrive_watcher_instance

    from ..services.extraction_worker import extraction_enabled, extraction_queue

    return {
        "watcher": {
            "enabled": get_setting(db, "watch_enabled") == "true",
            "running": bool(watcher is not None and getattr(watcher, "observer", None) is not None),
            "roots": get_setting(db, "watch_roots"),
        },
        "extraction": {
            "enabled": extraction_enabled(),
            "queued": extraction_queue.qsize(),
        },
        "ingestion": _ingestion_state(db),
        "gdrive": {
            "enabled": get_setting(db, "gdrive_enabled") == "true",
            "running": bool(gdrive is not None and getattr(gdrive, "_thread", None) is not None),
        },
        "digest": {
            "enabled": get_setting(db, "digest_enabled") == "true",
            "frequency": get_setting(db, "digest_frequency"),
            "time": get_setting(db, "digest_time"),
        },
        "jobs": jobs_status(),
    }


def _apply_ingestion_live(db: Session) -> None:
    """Restart the watchers and sync the extraction flag to the stored settings."""
    from .. import runtime
    from ..services.extraction_worker import set_extraction_enabled
    if runtime.watcher_instance is not None:
        runtime.watcher_instance.restart()
    if runtime.gdrive_watcher_instance is not None:
        runtime.gdrive_watcher_instance.restart()
    set_extraction_enabled(get_setting(db, "extraction_enabled") != "false")


_INGEST_KEYS = ("watch_enabled", "gdrive_enabled", "extraction_enabled")


def _ingestion_state(db: Session) -> dict:
    vals = {k: get_setting(db, k) == "true" for k in _INGEST_KEYS}
    return {**vals, "paused_all": not any(vals.values()),
            "can_resume": bool(get_setting(db, "ingestion_prepause"))}


@router.post("/ingestion/pause-all")
def pause_all_ingestion(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Stop folder watching, Drive polling, and AI extraction together, snapshotting
    the prior state so Resume restores exactly what was on."""
    import json
    from ..services.settings_store import set_setting
    snap = {k: get_setting(db, k) for k in _INGEST_KEYS}
    set_setting(db, "ingestion_prepause", json.dumps(snap))
    for k in _INGEST_KEYS:
        set_setting(db, k, "false")
    db.commit()
    _apply_ingestion_live(db)
    log_action(db, "settings", 0, "UPDATE", user_id=user.id, field="ingestion", new_value="paused all")
    return _ingestion_state(db)


@router.post("/ingestion/resume-all")
def resume_all_ingestion(db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Resume ingestion, restoring the switches to their pre-pause state."""
    import json
    from ..services.settings_store import set_setting
    snap = get_setting(db, "ingestion_prepause")
    restore = json.loads(snap) if snap else {"watch_enabled": "true", "gdrive_enabled": "false",
                                             "extraction_enabled": "true"}
    for k in _INGEST_KEYS:
        set_setting(db, k, restore.get(k, "true"))
    set_setting(db, "ingestion_prepause", "")
    db.commit()
    _apply_ingestion_live(db)
    log_action(db, "settings", 0, "UPDATE", user_id=user.id, field="ingestion", new_value="resumed all")
    return _ingestion_state(db)


@router.post("/digest-now")
def send_digest_now(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Build and send the summary digest immediately (forced, ignoring the
    'nothing to report' skip), for previewing/testing the configuration."""
    from ..services.digest import send_digest

    result = send_digest(db, force=True)
    result["dry_run"] = get_setting(db, "email_dry_run") == "true"
    return result


@router.post("/notify-test")
def notify_test(channel: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Send a test message to a chat channel (slack|teams) to verify its webhook."""
    from ..services.notifications import get_channel

    if channel not in ("slack", "teams"):
        raise HTTPException(400, "channel must be 'slack' or 'teams'")
    url = get_setting(db, f"{channel}_webhook_url")
    if not url:
        raise HTTPException(400, f"No {channel} webhook URL is configured")
    ch = get_channel(channel)
    try:
        ch.send([], "[CMS] Test notification",
                "<p>This is a test message from the Contract Management System. "
                "If you can see it, the webhook is working.</p>")
    except Exception as exc:
        raise HTTPException(400, f"Send failed: {exc}")
    return {"ok": True, "channel": channel}


@router.post("/event-webhook-test")
def event_webhook_test(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """POST a sample contract.validated event to the configured webhook URL."""
    import json
    import urllib.request

    from ..services.event_webhooks import sign_payload

    url = get_setting(db, "event_webhook_url")
    if not url:
        raise HTTPException(400, "No event webhook URL is configured")
    secret = get_setting(db, "event_webhook_secret")
    event = {
        "event": "contract.validated",
        "timestamp": "2026-01-01T00:00:00+00:00",
        "data": {"sr_no": 0, "vendor": "Example Vendor", "status": "VALIDATED",
                 "note": "This is a test event from the Contract Management System."},
    }
    body = json.dumps(event).encode()
    headers = {"Content-Type": "application/json", "X-CMS-Event": event["event"]}
    if secret:
        headers["X-CMS-Signature"] = sign_payload(secret, body)
    try:
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        urllib.request.urlopen(req, timeout=15).close()
    except Exception as exc:
        raise HTTPException(400, f"Delivery failed: {exc}")
    return {"ok": True, "signed": bool(secret)}


@router.post("/gdrive/poll-now")
def gdrive_poll_now(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Trigger an immediate Google Drive poll and return a diagnostic report:
    per-folder counts plus actionable errors so a zero-import poll explains why."""
    from ..services.extraction_worker import extraction_queue
    from ..services.gdrive import GoogleDriveWatcher

    return GoogleDriveWatcher(extraction_queue).poll_report()


# ---------------------------------------------------------------------------
# Claude extraction prompt templates (versioned, editable)
# ---------------------------------------------------------------------------

@router.get("/prompts")
def list_prompts(name: str = "contract_extraction", db: Session = Depends(get_db),
                 _: User = Depends(require_viewer)):
    rows = (
        db.query(PromptTemplate).filter(PromptTemplate.name == name)
        .order_by(PromptTemplate.version.desc()).all()
    )
    return [
        {"id": p.id, "name": p.name, "version": p.version, "is_active": p.is_active,
         "content": p.content, "created_at": p.created_at.isoformat()}
        for p in rows
    ]


@router.get("/prompt-catalog")
def prompt_catalog(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Editable authoring prompt kinds (defaults merged with the active version)."""
    from ..services.prompts import catalog
    return catalog(db)


@router.post("/prompts")
def create_prompt_version(payload: PromptIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    name = payload.name or "contract_extraction"
    latest = (
        db.query(PromptTemplate).filter(PromptTemplate.name == name)
        .order_by(PromptTemplate.version.desc()).first()
    )
    version = (latest.version + 1) if latest else 1
    prompt = PromptTemplate(
        name=name, version=version, content=payload.content, is_active=payload.activate,
    )
    if payload.activate:
        # Deactivate other versions of the SAME prompt only.
        db.query(PromptTemplate).filter(PromptTemplate.name == name).update(
            {PromptTemplate.is_active: False})
    db.add(prompt)
    db.flush()
    log_action(db, "prompt_template", prompt.id, "CREATE", user_id=user.id,
               field=name, new_value=f"version {version}")
    db.commit()
    return {"id": prompt.id, "name": prompt.name, "version": prompt.version, "is_active": prompt.is_active}


@router.post("/prompts/{prompt_id}/activate")
def activate_prompt(prompt_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    prompt = db.get(PromptTemplate, prompt_id)
    if prompt is None:
        raise HTTPException(404, "Prompt version not found")
    db.query(PromptTemplate).filter(PromptTemplate.name == prompt.name).update(
        {PromptTemplate.is_active: False})
    prompt.is_active = True
    log_action(db, "prompt_template", prompt.id, "ACTIVATE", user_id=user.id, field=prompt.name)
    db.commit()
    return {"id": prompt.id, "name": prompt.name, "version": prompt.version, "is_active": True}


# ---------------------------------------------------------------------------
# Reminder email templates (admin-editable, placeholder-based)
# ---------------------------------------------------------------------------

@router.get("/email-templates")
def list_email_templates(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    # Every known notification kind (built-in default merged with any override).
    from ..services.email_templates import catalog
    return catalog(db)


@router.put("/email-templates/{name}")
def upsert_email_template(
    name: str, payload: EmailTemplateIn, db: Session = Depends(get_db), user: User = Depends(require_admin)
):
    template = db.query(EmailTemplate).filter(EmailTemplate.name == name).first()
    if template is None:
        template = EmailTemplate(name=name, subject=payload.subject, body=payload.body)
        db.add(template)
    else:
        template.subject = payload.subject
        template.body = payload.body
    db.flush()
    log_action(db, "email_template", template.id, "UPSERT", user_id=user.id, field=name)
    db.commit()
    return {"id": template.id, "name": template.name}


@router.delete("/email-templates/{name}")
def reset_email_template(name: str, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Remove an override so the built-in default is used again."""
    template = db.query(EmailTemplate).filter(EmailTemplate.name == name).first()
    if template is not None:
        db.delete(template)
        log_action(db, "email_template", template.id, "RESET", user_id=user.id, field=name)
        db.commit()
    return {"name": name, "reset": True}


# ---------------------------------------------------------------------------
# Role-based page access ("role admin")
# ---------------------------------------------------------------------------

@router.get("/page-access")
def get_page_access(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Page catalogue + effective role access. Readable by any signed-in user so
    the navigation can filter itself to what the user's role may see."""
    from ..services.page_access import PAGES, ROLES, get_config
    return {"pages": PAGES, "roles": ROLES, "access": get_config(db)}


@router.put("/page-access")
def set_page_access(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Save the page→roles map. Admin (or super admin) only."""
    from ..services.page_access import set_config
    access = set_config(db, payload.get("access") or {})
    log_action(db, "settings", 0, "UPDATE", user_id=user.id, field="page_access")
    db.commit()
    return {"access": access}


# ---------------------------------------------------------------------------
# Admin-managed pick lists (currencies, business units) for the contract forms
# ---------------------------------------------------------------------------

@router.get("/master-lists")
def get_master_lists(db: Session = Depends(get_db), _: User = Depends(require_viewer)):
    """Currencies + business units for the validation/authoring form dropdowns.
    Readable by any signed-in user so the forms can populate their pickers."""
    from ..services.master_lists import get_lists
    return get_lists(db)


@router.put("/master-lists")
def set_master_lists(payload: dict, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Save the currencies / business-units pick lists. Admin (or super admin) only."""
    from ..services.master_lists import set_lists
    lists = set_lists(db, payload or {})
    log_action(db, "settings", 0, "UPDATE", user_id=user.id, field="master_lists")
    db.commit()
    return lists


# ---------------------------------------------------------------------------
# Per-business-unit letterheads
# ---------------------------------------------------------------------------

@router.get("/letterheads")
def list_letterheads(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Every configured letterhead, with its page geometry. Metadata only — the
    artwork is fetched per BU from the image endpoint below."""
    from ..services import letterhead as LH
    return {"letterheads": LH.list_all(db)}


@router.get("/letterhead")
def resolve_letterhead(bu: str = "", db: Session = Depends(get_db),
                       _: User = Depends(require_viewer)):
    """The letterhead a draft in this business unit prints on, or null.

    Readable by any signed-in user because the authoring editor asks for it on
    every draft, to show the author the paper their contract will come out on.
    """
    from ..services import letterhead as LH
    row = LH.for_business_unit(db, bu)
    return LH.as_dict(row) if row else None


@router.get("/letterhead/image")
def letterhead_image(bu: str = "", kind: str = "header", db: Session = Depends(get_db),
                     _: User = Depends(require_viewer)):
    """The letterhead artwork itself, resolved the same way the exports resolve it."""
    from fastapi.responses import Response
    from ..services import letterhead as LH
    if kind not in ("header", "footer"):
        raise HTTPException(400, "kind must be 'header' or 'footer'.")
    data = LH.image_bytes(LH.for_business_unit(db, bu), kind)
    if not data:
        raise HTTPException(404, "No letterhead artwork for that business unit.")
    # Private: this is company stationery, and the URL is shared across users of
    # the BU. no-store keeps it out of shared caches; the browser re-asks, which
    # is cheap next to getting a stale letterhead after an admin replaces one.
    return Response(content=data, media_type="image/jpeg",
                    headers={"Cache-Control": "private, no-store"})


@router.post("/letterhead")
async def upload_letterhead(bu: str = "", kind: str = "header",
                            file: UploadFile = File(...),
                            db: Session = Depends(get_db),
                            user: User = Depends(require_admin)):
    """Upload one band of a business unit's letterhead.

    ``bu`` empty is the default letterhead, used by drafts whose BU is unset or
    has no letterhead of its own.
    """
    from ..services import letterhead as LH
    from ..services.upload_guard import read_upload
    data = read_upload(file, allowed_exts=LH.LETTERHEAD_EXTS,
                       max_bytes=LH.MAX_LETTERHEAD_BYTES)
    try:
        row = LH.save_image(db, bu, kind, data, user_id=user.id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    log_action(db, "settings", 0, "UPDATE", user_id=user.id,
               field=f"letterhead:{row.business_unit or '(default)'}:{kind}")
    db.commit()
    return LH.as_dict(row)


@router.delete("/letterhead")
def delete_letterhead(bu: str = "", kind: str = "all", db: Session = Depends(get_db),
                      user: User = Depends(require_admin)):
    """Remove a whole letterhead (kind=all) or just its footer band."""
    from ..services import letterhead as LH
    if kind == "all":
        if not LH.delete(db, bu):
            raise HTTPException(404, "No letterhead for that business unit.")
        result = None
    else:
        try:
            row = LH.clear_image(db, bu, kind)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        if row is None:
            raise HTTPException(404, "No letterhead for that business unit.")
        result = LH.as_dict(row)
    log_action(db, "settings", 0, "DELETE", user_id=user.id,
               field=f"letterhead:{LH.normalize_key(bu) or '(default)'}:{kind}")
    db.commit()
    return result
