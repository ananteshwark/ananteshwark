"""Pydantic request/response schemas."""
from datetime import date

from pydantic import BaseModel, EmailStr, Field, field_validator


def _validate_email_list(value: str | None) -> str | None:
    """Validate a comma/newline-separated list of email addresses and return it
    normalized to a comma-separated string. Empty/blank -> None."""
    if not value or not value.strip():
        return None
    from email_validator import EmailNotValidError, validate_email

    cleaned = []
    for part in value.replace("\n", ",").split(","):
        addr = part.strip()
        if not addr:
            continue
        try:
            validate_email(addr, check_deliverability=False)
        except EmailNotValidError as exc:
            raise ValueError(f"Invalid email address '{addr}': {exc}") from exc
        cleaned.append(addr)
    return ", ".join(cleaned) or None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    credential: str  # Google Identity Services ID token (JWT)


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(min_length=8)
    role: str = "VIEWER"
    roles: list[str] | None = None  # optional multi-role; first becomes primary


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    roles: list[str] | None = None  # optional multi-role; replaces the role set
    is_active: bool | None = None


class PasswordReset(BaseModel):
    new_password: str = Field(min_length=8)


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class EmailTestRequest(BaseModel):
    to: EmailStr


class NoteIn(BaseModel):
    body: str = Field(min_length=1)


class DepartmentIn(BaseModel):
    name: str
    # One or more addresses, comma/newline-separated (reminders CC all of them).
    default_recipient_email: str | None = None
    default_recipient_name: str | None = None
    # Per-department approval gates (Module F). None = inherit the global setting.
    approval_require_legal: bool | None = None
    approval_value_threshold: float | None = None
    # Default e-signature signers: [{name, email, role, order}].
    default_signers: list[dict] | None = None

    _normalize_emails = field_validator("default_recipient_email")(_validate_email_list)


class VendorIn(BaseModel):
    name: str
    addresses: list[str] = []
    contacts: list[dict] = []
    aliases: list[str] = []


class ContractUpdate(BaseModel):
    """Editable fields on the validation screen / contract detail."""
    signing_entity: str | None = None
    vendor_id: int | None = None
    vendor_name_raw: str | None = None
    new_vendor_name: str | None = None  # create-and-attach a new vendor
    vendor_address: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    contract_tenure: str | None = None
    department_id: int | None = None
    po_number: str | None = None
    contract_value: float | None = None
    savings_amount: float | None = None
    currency: str | None = None
    iks_signing_authority: str | None = None
    vendor_signing_authority: str | None = None
    contract_service: str | None = None
    service_summary: str | None = None
    payment_term: str | None = None
    notice_period: str | None = None
    line_items: list[dict] | None = None
    contract_type: str | None = None
    location: str | None = None
    phi_shared: bool | None = None
    custom_fields: dict | None = None


class LinkDocument(BaseModel):
    sr_no: int  # the other contract to link into this contract's group


class TagIn(BaseModel):
    name: str
    color: str | None = None


class TagAssign(BaseModel):
    tag_ids: list[int]


class SavedFilterIn(BaseModel):
    name: str
    params: dict = {}


class AssigneeUpdate(BaseModel):
    user_id: int | None = None  # null unassigns


class SnoozeRequest(BaseModel):
    days: int | None = None    # snooze this many days from today
    until: date | None = None  # …or an explicit date; both null clears the snooze


class RetentionAction(BaseModel):
    entity_type: str  # contract | vendor | department
    id: int


class MilestoneIn(BaseModel):
    title: str
    description: str | None = None
    due_date: date | None = None
    obligation_type: str | None = None
    owner_party: str | None = None
    owner_user_id: int | None = None
    frequency: str | None = None


class MilestoneUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: date | None = None
    status: str | None = None  # PENDING | DONE
    obligation_type: str | None = None
    owner_party: str | None = None
    owner_user_id: int | None = None
    frequency: str | None = None


class ValidateRequest(ContractUpdate):
    # When true, save even though potential duplicates were reported
    force: bool = False


class RejectRequest(BaseModel):
    reason: str


class LifecycleRequest(BaseModel):
    status: str  # ACTIVE | EXPIRED | RENEWED | TERMINATED


class RecipientIn(BaseModel):
    name: str
    email: EmailStr
    is_primary: bool = False
    user_id: int | None = None


class RecipientsUpdate(BaseModel):
    recipients: list[RecipientIn]


class ReminderOverride(BaseModel):
    reminder_rule_id: int | None = None
    custom_offsets: list[int] | None = None
    # Per-contract escalation override (falls back to the resolved rule's values)
    escalation_after: int | None = None
    escalation_email: EmailStr | None = None


class RuleIn(BaseModel):
    name: str
    offsets: list[int]
    periodicity_days: int | None = None
    post_expiry_days: int | None = None
    escalation_after: int | None = None
    escalation_email: EmailStr | None = None
    channels: list[str] = ["email"]
    department_ids: list[int] = []
    # 'existing_and_new' applies the mapping to already-validated contracts too
    apply_scope: str = "existing_and_new"


class DuplicateResolveRequest(BaseModel):
    resolution: str  # CONFIRMED_DUPLICATE | RENEWAL | NOT_DUPLICATE


class VendorMerge(BaseModel):
    source_ids: list[int]  # vendors folded into the target (path) vendor


class BulkContractAction(BaseModel):
    # assign_department | assign_rule | reject | validate | add_tags | remove_tags | set_type
    sr_nos: list[int]
    action: str
    department_id: int | None = None
    reminder_rule_id: int | None = None
    reason: str | None = None
    tag_ids: list[int] | None = None
    contract_type: str | None = None
    user_id: int | None = None  # assignee for assign_user (null unassigns)


class SettingsUpdate(BaseModel):
    values: dict[str, str]


class PromptIn(BaseModel):
    content: str
    activate: bool = True
    name: str = "contract_extraction"


class EmailTemplateIn(BaseModel):
    subject: str
    body: str


# ---------------------------------------------------------------------------
# Contract Authoring Module
# ---------------------------------------------------------------------------

class DraftCreate(BaseModel):
    origin: str = "scratch"           # scratch | duplicate | template
    contract_type: str | None = None
    title: str | None = None
    source_contract_id: int | None = None   # for origin=duplicate
    template_id: int | None = None           # for origin=template
    link_as: str | None = None               # renewal | amendment (duplicate of same vendor)


class DraftUpdate(BaseModel):
    title: str | None = None
    contract_type: str | None = None
    status: str | None = None
    fields: dict | None = None
    document: dict | None = None
    vendor_id: int | None = None
    department_id: int | None = None
    link_as: str | None = None
    renews_contract_id: int | None = None
    note: str | None = None                   # optional label for the saved snapshot
    base_rev: int | None = None               # optimistic-concurrency guard (see rev)


class TemplateIn(BaseModel):
    name: str
    contract_type: str | None = None
    department_id: int | None = None
    description: str | None = None
    body: dict | None = None
    field_defaults: dict | None = None


class PromoteToTemplate(BaseModel):
    name: str
    description: str | None = None
    department_id: int | None = None


# ---------------------------------------------------------------------------
# Vendor Collaboration (Module D)
# ---------------------------------------------------------------------------

class ShareRecipient(BaseModel):
    email: EmailStr
    name: str | None = None


class ShareCreate(BaseModel):
    recipients: list[ShareRecipient]
    access: str = "SUGGEST"          # VIEW | COMMENT | SUGGEST
    expires_days: int = 14
    due_days: int | None = None
    cover_message: str | None = None
    watermark: bool = True
    allow_download: bool = False
    require_otp: bool = False


class VendorChangeIn(BaseModel):
    change_type: str = "REPLACE"     # INSERT | DELETE | REPLACE | COMMENT
    block_index: int | None = None
    original_text: str | None = None
    proposed_text: str | None = None
    rationale: str | None = None


class ChangeDecision(BaseModel):
    decision: str                    # ACCEPTED | REJECTED | COUNTERED | WITHDRAWN
    reason: str | None = None
    countered_text: str | None = None


class OtpVerify(BaseModel):
    code: str
