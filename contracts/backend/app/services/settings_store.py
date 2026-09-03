"""DB-backed runtime settings (admin-editable), overriding env defaults.

Secret values (API key, SMTP password) are write-only through the API: GET
returns a mask and PUT ignores the mask sentinel, so secrets never round-trip
to the frontend.
"""
from sqlalchemy.orm import Session

from ..config import settings
from ..models import AppSetting

MASK = "********"
SECRET_KEYS = {
    "anthropic_api_key", "openai_api_key", "gemini_api_key", "custom_api_key",
    "smtp_password", "gdrive_credentials_json",
    "slack_webhook_url", "teams_webhook_url",
    "event_webhook_url", "event_webhook_secret",
    "docusign_private_key", "docusign_webhook_secret",
    "oidc_client_secret",
}

# Internal runtime state stored in AppSetting but NOT admin-editable — kept out
# of the settings API surface (never returned by all_settings, so it is never
# echoed back on save and can't trip the "unknown setting" guard).
INTERNAL_KEYS = {
    "app_build_number", "app_build_commit", "app_build_date",
    # Clause intelligence: managed via dedicated /clauses endpoints, not the
    # general settings form.
    "clause_taxonomy", "clause_learned_ids",
    # Role-based page access: managed via /settings/page-access, not the form.
    "page_access",
    # Admin pick lists: managed via /settings/master-lists, not the form.
    "master_currencies", "master_business_units",
    # Snapshot of ingestion switches before a "pause all" (internal state).
    "ingestion_prepause",
}

DEFAULTS = {
    # One folder per line; every folder is watched recursively
    "watch_roots": settings.WATCH_ROOT,
    "watch_enabled": str(settings.WATCH_ENABLED).lower(),
    # Master switch for AI extraction. When "false", queued files wait (are not
    # extracted) until it is turned back on — nothing is lost.
    "extraction_enabled": "true",
    # Auto-create renewal drafts N days before a validated contract expires.
    "auto_renewal_enabled": "false",
    "auto_renewal_lead_days": "60",
    "file_stability_seconds": str(settings.FILE_STABILITY_SECONDS),
    "supported_extensions": ",".join(settings.SUPPORTED_EXTENSIONS),
    "reminder_run_time": settings.REMINDER_RUN_TIME,
    # Expiry reminders normally cover validated contracts only, on the grounds
    # that nobody has confirmed an unvalidated contract's end date. Turning this
    # on also reminds for contracts still awaiting validation, so a real expiry
    # is not missed just because the record has not been checked yet. Rejected
    # and archived contracts are never reminded about either way.
    "reminders_include_unvalidated": "false",
    # Attach the contract document to expiry reminders. On by default because a
    # reminder to act on a contract is more useful with the contract in hand;
    # turn it off where contract documents must not travel by email.
    "reminder_attach_document": "true",
    # Ceiling on the attached file, in MB. A property of the mail relay, not of
    # this app — most refuse messages over 10-25 MB, and base64 adds a third.
    "reminder_attach_max_mb": "10",
    "confidence_threshold": str(settings.CONFIDENCE_THRESHOLD),
    # Suggested contract-type vocabulary (comma/newline separated) for the
    # type dropdown; contracts may still hold any value.
    "contract_types": "NDA, MSA, SOW, Service Agreement, Purchase Order, Lease, "
    "License, Amendment, Renewal",
    # When a department's rule mapping changes: 'existing_and_new' | 'new_only'
    "rule_change_scope": "existing_and_new",
    # AI extraction provider: 'claude' | 'openai' | 'gemini' | 'custom'
    "extraction_provider": "claude",
    # Optional second extractor: a different provider used on demand (Retry with
    # 2nd AI) when the primary extraction came out poorly. Reuses that provider's
    # key/model configured below.
    "secondary_extraction_enabled": "false",
    "secondary_extraction_provider": "openai",
    # Claude API — empty means "use the ANTHROPIC_API_KEY environment variable"
    "anthropic_api_key": "",
    "claude_model": settings.CLAUDE_MODEL,
    # OpenAI (ChatGPT) API
    "openai_api_key": "",
    "openai_model": "gpt-4o",
    # Google Gemini API
    "gemini_api_key": "",
    "gemini_model": "gemini-2.5-pro",
    # Custom / self-hosted OpenAI-compatible LLM (vLLM, Ollama, LM Studio,
    # LocalAI, text-generation-inference, …). Base URL points at the server's
    # OpenAI-compatible endpoint, e.g. http://localhost:8000/v1
    "custom_api_base": "",
    "custom_api_key": "",   # optional — many local servers accept any token
    "custom_model": "",     # model name the endpoint serves
    # Names (and variants) that identify OUR organization as the signing entity,
    # never the vendor. Comma- or newline-separated; injected into the prompt.
    "organization_entities": "Inventurus, TruBridge, Arai, WWMG, Western Washington",
    # Email / SMTP
    "smtp_host": settings.SMTP_HOST,
    "smtp_port": str(settings.SMTP_PORT),
    "smtp_user": settings.SMTP_USER,
    "smtp_password": "",
    "smtp_from": settings.SMTP_FROM,
    "smtp_tls": str(settings.SMTP_TLS).lower(),
    "email_dry_run": str(settings.EMAIL_DRY_RUN).lower(),
    # Chat notifications (incoming webhooks; URLs contain secret tokens)
    "slack_webhook_url": "",
    "teams_webhook_url": "",
    # Also post the scheduled digest summary to configured chat channels
    "digest_chat_enabled": "false",
    # Outbound contract-event webhooks
    "event_webhook_enabled": "false",
    "event_webhook_url": "",              # POST target (write-only secret)
    "event_webhook_secret": "",           # HMAC-SHA256 signing secret (optional)
    "event_webhook_events": "",           # blank = all; else comma list of event types
    # Scheduled summary ("digest") email
    "digest_enabled": "false",
    "digest_frequency": "daily",       # 'daily' | 'weekly'
    "digest_day_of_week": "0",         # weekly only: 0=Mon … 6=Sun
    "digest_time": "08:00",            # HH:MM in the app timezone
    "digest_recipients": "",           # blank = all active admins
    # Extraction-failure alerts
    "failure_alerts_enabled": "true",
    "failure_alert_emails": "",       # blank = all active admins
    "failure_alert_webhook": "",      # optional URL to POST failure events
    # Google Sign-In for app users (client ID is public — not a secret)
    "google_auth_enabled": "false",
    "google_client_id": settings.GOOGLE_CLIENT_ID,
    "google_allowed_domain": "",       # e.g. "example.com" restricts sign-in
    "google_auto_provision": "false",  # create unknown users (requires allowed_domain)
    "google_default_role": "VIEWER",   # role for auto-provisioned users
    # Google Drive monitoring (second ingestion source)
    "gdrive_enabled": "false",
    "gdrive_folder_ids": "",              # one Drive folder id per line
    "gdrive_credentials_json": "",        # service-account JSON (write-only secret)
    "gdrive_poll_seconds": "300",
    "gdrive_staging_dir": settings.GDRIVE_STAGING,
    # E-signature (Module E). Provider: 'mock' (default) | 'docusign'.
    "esign_provider": "mock",
    "docusign_base_url": "https://demo.docusign.net",
    "docusign_oauth_host": "account-d.docusign.com",
    "docusign_account_id": "",
    "docusign_integration_key": "",
    "docusign_user_id": "",
    "docusign_private_key": "",           # RSA private key (write-only secret)
    "docusign_webhook_secret": "",        # optional HMAC for DocuSign Connect
    # Approval gates (Module F): require Legal sign-off, and Finance sign-off
    # above a contract-value threshold, before sending for signature.
    "approval_require_legal": "false",
    "approval_value_threshold": "0",      # 0 = no finance gate
    # Configurable multi-stage approval policy (JSON list of stages). Empty = use
    # the legacy legal/finance gates above. Each stage:
    #   {key,name,approver_role,order,condition:{type,value},sla_days}
    # condition.type ∈ always | value_gte | contract_type | department.
    "approval_policy": "",
    # Require the approval gates to be satisfied before a draft may be shared
    # externally (not only before signature).
    "require_approval_before_share": "false",
    # Require an internal reviewer's explicit sign-off before sharing with a vendor.
    # Legacy: internal review is advisory by design and this key gates nothing.
    # Kept so saved values still load; the admin control that offered it has been
    # removed rather than left promising a gate that does not exist.
    "require_internal_review_before_share": "false",
    # Use the configured AI model (extraction_provider) for the authoring
    # module's AI features: gap analysis, clause-difference summaries and
    # change-risk commentary. Falls back to the deterministic engine when off or
    # unavailable.
    "clause_ai_enabled": "true",
    # Automatically feed a contract's clauses into the library when it is
    # validated, so the library grows without a manual "Learn" run.
    "clause_autolearn": "true",
    # Authoring register fields that only Legal/Admin may edit (comma-separated
    # field keys, e.g. "contract_value,payment_term"). Blank = no restriction.
    "restricted_authoring_fields": "",
    # Contract register fields that only Legal/Admin may edit (comma-separated
    # field keys, e.g. "contract_value,savings_amount"). Blank = no restriction (G16).
    "restricted_contract_fields": "",
    # Base currency for portfolio-value normalization (G15). FX rates are entered
    # by an admin (offline); each rate says how many base units one unit is worth.
    "base_currency": "INR",
    # Obligation reminders (F4/F2): days before the due date to notify the owner.
    # Blank disables. Overdue obligations are chased once, then escalated.
    # Retrieval (G1). "concept" is the offline default: contract wording is
    # mapped onto canonical concepts so paraphrases match. "hashing" is the
    # legacy character-n-gram vector. "sentence_transformers" uses a real
    # encoder when the dependency and model are present on the host.
    "embedding_provider": "concept",
    "embedding_model": "all-MiniLM-L6-v2",
    # Weight of the vector signal when fused with keyword search (0-1).
    "hybrid_vector_weight": "0.6",
    "obligation_reminders_enabled": "true",
    "obligation_reminder_offsets": "14,7,1",
    "obligation_escalate_after_days": "7",
    # Per-feature prompt and model overrides (I3) are added below, one pair per
    # AI feature, so an admin can retune or re-route a single feature — and roll
    # it back — without a deploy.
    # On-prem SSO via generic OIDC (G11). Points at an internal IdP (Keycloak/
    # ADFS/Entra internal). Local password login always remains available.
    "oidc_enabled": "false",
    "oidc_button_label": "Sign in with SSO",
    "oidc_client_id": "",
    "oidc_client_secret": "",             # write-only secret (masked on read)
    "oidc_authorization_endpoint": "",
    "oidc_token_endpoint": "",
    "oidc_userinfo_endpoint": "",
    "oidc_redirect_uri": "",
    "oidc_scopes": "openid email profile",
    "oidc_allowed_domain": "",           # optional email-domain allowlist
    "oidc_auto_provision": "false",      # create unknown users on first login
    "oidc_default_role": "VIEWER",
}

# Per-feature prompt/model override keys (I3). Registered here so the settings
# API accepts them; blank means "use the built-in prompt / the global model".
for _feature in ("summary", "obligations", "ask", "ask_one",
                 "negotiation_reply", "intake"):
    DEFAULTS[f"prompt_{_feature}"] = ""
    DEFAULTS[f"model_{_feature}"] = ""
del _feature


def get_setting(db: Session, key: str) -> str:
    row = db.get(AppSetting, key)
    if row is not None:
        return row.value
    return DEFAULTS.get(key, "")


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def all_settings(db: Session, mask_secrets: bool = True) -> dict:
    result = dict(DEFAULTS)
    for row in db.query(AppSetting).all():
        if row.key in INTERNAL_KEYS:
            continue  # internal runtime state — not part of the settings surface
        result[row.key] = row.value
    if mask_secrets:
        for key in SECRET_KEYS:
            result[key] = MASK if result.get(key) else ""
    return result


def get_watch_roots(db: Session) -> list[str]:
    raw = get_setting(db, "watch_roots")
    return [line.strip() for line in raw.replace(",", "\n").splitlines() if line.strip()]
