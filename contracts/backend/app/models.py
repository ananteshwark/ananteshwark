"""Database models for the Contract Management System.

All timestamps are stored in UTC. Soft deletes only (deleted_at).
"""
import enum
from datetime import date, datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class UserRole(str, enum.Enum):
    # SUPER_ADMIN supersedes every role (all access, including deleting records).
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN = "ADMIN"
    VALIDATOR = "VALIDATOR"
    VIEWER = "VIEWER"
    # Contract Authoring roles (Module F). Author drafts contracts; Legal Reviewer
    # governs legal-approved clauses and the legal approval gate; Approver signs
    # off value/finance approval gates. (Vendors are external — token-only, no role.)
    AUTHOR = "AUTHOR"
    LEGAL = "LEGAL"
    APPROVER = "APPROVER"


class IngestionStatus(str, enum.Enum):
    QUEUED = "QUEUED"
    EXTRACTING = "EXTRACTING"
    EXTRACTED = "EXTRACTED"
    PENDING_VALIDATION = "PENDING_VALIDATION"
    VALIDATED = "VALIDATED"
    DUPLICATE = "DUPLICATE"
    FAILED = "FAILED"


class ContractStatus(str, enum.Enum):
    PENDING_VALIDATION = "PENDING_VALIDATION"
    VALIDATED = "VALIDATED"
    REJECTED = "REJECTED"
    ARCHIVED = "ARCHIVED"


class LifecycleStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    RENEWED = "RENEWED"
    TERMINATED = "TERMINATED"


class DuplicateResolution(str, enum.Enum):
    PENDING = "PENDING"
    CONFIRMED_DUPLICATE = "CONFIRMED_DUPLICATE"
    RENEWAL = "RENEWAL"
    NOT_DUPLICATE = "NOT_DUPLICATE"


# ---------------------------------------------------------------------------
# Users, departments, vendors
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    hashed_password: Mapped[str] = mapped_column(String(512))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.VIEWER)
    # Additional roles beyond the primary `role`, so one person can hold several
    # (e.g. VALIDATOR + LEGAL). Stored as a list of role-name strings.
    extra_roles: Mapped[list | None] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    # Default reminder recipients for contracts of this department
    # One or more addresses (comma/newline-separated); reminders CC all of them.
    default_recipient_email: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    default_recipient_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Per-department approval gates (Module F). NULL = inherit the global default
    # (approval_require_legal / approval_value_threshold settings).
    approval_require_legal: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    approval_value_threshold: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    # Default e-signature signer roster for this department: list of
    # {name, email, role, order}. Pre-populates the Send-for-Signature dialog.
    default_signers: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class InternalEntity(Base):
    """One of our own organization entities (the signing party, never the vendor).

    `name` is the canonical form to normalize to; `aliases` are the other ways it
    appears in documents (abbreviations, legal-name variants). Used to guide the
    AI extractor and to deterministically canonicalize the extracted signing
    entity to the exact `name`.
    """
    __tablename__ = "internal_entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    aliases: Mapped[list | None] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Vendor(Base):
    __tablename__ = "vendors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(500))
    normalized_name: Mapped[str] = mapped_column(String(500), index=True)
    addresses: Mapped[list | None] = mapped_column(JSON, default=list)
    contacts: Mapped[list | None] = mapped_column(JSON, default=list)
    # Counterparty risk profile (G14): coarse rating + notes.
    risk_rating: Mapped[str | None] = mapped_column(String(20), nullable=True)  # low/medium/high
    risk_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    aliases: Mapped[list["VendorAlias"]] = relationship(back_populates="vendor")
    contracts: Mapped[list["Contract"]] = relationship(back_populates="vendor")
    compliance_docs: Mapped[list["ComplianceDocument"]] = relationship(back_populates="vendor")


class ComplianceDocument(Base):
    """A counterparty compliance artefact (insurance certificate, W-9, DPA,
    certification…) with issue/expiry tracking and an optional stored file (G14)."""
    __tablename__ = "compliance_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)
    doc_type: Mapped[str] = mapped_column(String(40), default="other")  # insurance/w9/nda/dpa/certification/other
    name: Mapped[str] = mapped_column(String(255))
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    issued_date: Mapped[object | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[object | None] = mapped_column(Date, nullable=True, index=True)
    filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    path: Mapped[str | None] = mapped_column(Text, nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    vendor: Mapped["Vendor"] = relationship(back_populates="compliance_docs")


class VendorAlias(Base):
    __tablename__ = "vendor_aliases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vendor_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)
    alias: Mapped[str] = mapped_column(String(500))
    normalized_alias: Mapped[str] = mapped_column(String(500), index=True)

    vendor: Mapped[Vendor] = relationship(back_populates="aliases")


class VendorMergeLog(Base):
    """One row per source vendor absorbed in a merge, capturing everything needed
    to reverse it. Rows sharing a batch_id came from a single merge call."""
    __tablename__ = "vendor_merge_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(32), index=True)
    target_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("vendors.id"), index=True)
    moved_contract_ids: Mapped[list] = mapped_column(JSON, default=list)
    added_alias_ids: Mapped[list] = mapped_column(JSON, default=list)
    added_addresses: Mapped[list] = mapped_column(JSON, default=list)
    added_contacts: Mapped[list] = mapped_column(JSON, default=list)
    merged_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    merged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    undone_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    undone_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


# ---------------------------------------------------------------------------
# Ingestion
# ---------------------------------------------------------------------------

class IngestionFile(Base):
    __tablename__ = "ingestion_files"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    path: Mapped[str] = mapped_column(Text)
    filename: Mapped[str] = mapped_column(String(512))
    subfolder: Mapped[str | None] = mapped_column(Text, nullable=True)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    # Where the file came from: LOCAL (watched folder) or GDRIVE (Google Drive)
    source: Mapped[str] = mapped_column(String(20), default="LOCAL", index=True)
    # Google Drive file id (or other external id), so a Drive file is imported once
    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    status: Mapped[IngestionStatus] = mapped_column(
        Enum(IngestionStatus), default=IngestionStatus.QUEUED, index=True
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Tokens consumed by the AI provider when processing this file
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Points at the original ingestion record when this file is a hash duplicate
    duplicate_of_id: Mapped[int | None] = mapped_column(
        ForeignKey("ingestion_files.id"), nullable=True
    )
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.sr_no"), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------

class Contract(Base):
    __tablename__ = "contracts"

    # sr_no is the system-generated register serial number / primary key
    sr_no: Mapped[int] = mapped_column(Integer, primary_key=True)

    signing_entity: Mapped[str | None] = mapped_column(String(500), nullable=True)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id"), nullable=True, index=True)
    vendor_name_raw: Mapped[str | None] = mapped_column(String(500), nullable=True)
    vendor_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[object | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[object | None] = mapped_column(Date, nullable=True, index=True)
    contract_tenure: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id"), nullable=True, index=True
    )
    po_number: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    contract_value: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    iks_signing_authority: Mapped[str | None] = mapped_column(String(500), nullable=True)
    vendor_signing_authority: Mapped[str | None] = mapped_column(String(500), nullable=True)
    contract_service: Mapped[str | None] = mapped_column(String(500), nullable=True)
    service_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Payment terms (e.g. "Net 30", "50% advance, 50% on delivery") and the
    # termination notice period (e.g. "30 days") stated in the contract.
    payment_term: Mapped[str | None] = mapped_column(String(500), nullable=True)
    notice_period: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Priced line items / rate card: list of
    # {item, unit, quantity, unit_rate, amount}. Drives per-line unit rates and
    # the vendor year-on-year rate history.
    line_items: Mapped[list | None] = mapped_column(JSON, default=list)
    contract_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Category of contract (NDA, MSA, SOW, Lease, …) — free value from an
    # admin-configured vocabulary; used for grouping and filtering.
    contract_type: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    # Location / site / jurisdiction the contract pertains to (extracted; also a
    # duplicate-detection signal — same everything but a different location is
    # usually a distinct contract).
    location: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    # Whether the contract involves sharing of PHI (protected health information).
    # Captured at renewal and editable on the validation form; filterable.
    phi_shared: Mapped[bool | None] = mapped_column(Boolean, nullable=True, index=True)

    status: Mapped[ContractStatus] = mapped_column(
        Enum(ContractStatus), default=ContractStatus.PENDING_VALIDATION, index=True
    )
    lifecycle_status: Mapped[LifecycleStatus] = mapped_column(
        Enum(LifecycleStatus), default=LifecycleStatus.ACTIVE
    )

    # Extraction artefacts
    raw_extracted: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Full extracted/OCR document text, for full-text search
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    derived_fields: Mapped[list | None] = mapped_column(JSON, default=list)
    # Fields auto-filled from the vendor's validated history (learning layer),
    # surfaced in the validation form as "filled from history — please review".
    learned_fields: Mapped[list | None] = mapped_column(JSON, default=list)
    extraction_model: Mapped[str | None] = mapped_column(String(100), nullable=True)
    prompt_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Repository AI (G6): a one-paragraph plain-language abstract, a key-terms
    # card (list of {label, value}), and an offline embedding vector for semantic
    # search. All computed post-validation and refreshable on demand.
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_key_terms: Mapped[list | None] = mapped_column(JSON, nullable=True)
    ai_indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    embedding: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Which embedding space `embedding` belongs to — a provider change makes
    # stored vectors stale, and mixing spaces silently degrades retrieval (G1).
    embedding_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Structured clause values (liability cap, notice days, auto-renewal…) so
    # they can be filtered and reported on rather than only searched (J1).
    clause_attributes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Negotiated savings captured for this contract (initial vs final), for the
    # spend-under-management / savings report (G12).
    savings_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    # Admin-defined custom field values, keyed by CustomFieldDef.key (G7).
    custom_fields: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Legal hold (G16): when set, the record is locked from edit and exempt from
    # deletion / purge until released by Legal or an admin.
    # Playbook risk (F5): scored against Legal's playbook and persisted so it can
    # be filtered, reported, trended and used as an approval gate.
    risk_score: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    risk_level: Mapped[str | None] = mapped_column(String(10), nullable=True)
    risk_scored_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    legal_hold: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    legal_hold_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    legal_hold_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    legal_hold_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Validation
    validated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Who is responsible for validating/owning this contract
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)

    # Renewal chain: renewals point at the contract they renew; thread_id groups the chain
    renews_contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("contracts.sr_no"), nullable=True
    )
    thread_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # Contract group: several documents (NDA/BAA/MSA/SOW…) that belong to the same
    # logical contract share a group_id (the anchor member's sr_no). Each member
    # keeps its own type, dates, value and renewal thread.
    group_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # Reminder overrides (rule defaults come from the department mapping)
    reminder_rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("reminder_rules.id"), nullable=True
    )
    custom_offsets: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Per-contract escalation override; falls back to the resolved rule's values
    escalation_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    escalation_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reminders_acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    # Pause reminders until this date (inclusive-exclusive: fires again on/after it)
    reminders_snoozed_until: Mapped[object | None] = mapped_column(Date, nullable=True)

    ingestion_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("ingestion_files.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    vendor: Mapped[Vendor | None] = relationship(back_populates="contracts")
    department: Mapped[Department | None] = relationship()
    recipients: Mapped[list["ContractRecipient"]] = relationship(back_populates="contract")
    tags: Mapped[list["Tag"]] = relationship(secondary="contract_tags")
    assignee: Mapped["User | None"] = relationship(foreign_keys=[assignee_id])


# Many-to-many link between contracts and tags.
contract_tags = Table(
    "contract_tags",
    Base.metadata,
    Column("contract_id", ForeignKey("contracts.sr_no"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id"), primary_key=True),
)


class Tag(Base):
    """A free-form label for organizing/filtering contracts (e.g. "urgent",
    "auto-renew", "confidential"). Many-to-many with contracts."""
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ContractAttachment(Base):
    """Additional documents attached to a contract (amendments, annexures,
    signed copies) beyond the primary contract_link document."""
    __tablename__ = "contract_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.sr_no"), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    path: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(50), default="other")  # amendment|annexure|signed|other
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ContractNote(Base):
    """Free-text collaboration notes on a contract (validators/admins)."""
    __tablename__ = "contract_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.sr_no"), index=True)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class MilestoneStatus(str, enum.Enum):
    PENDING = "PENDING"
    DONE = "DONE"


class ContractMilestone(Base):
    """An obligation / deliverable / milestone within a contract, with its own
    due date and completion status (e.g. "Submit SLA report", "Renewal notice
    deadline")."""
    __tablename__ = "contract_milestones"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.sr_no"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[object | None] = mapped_column(Date, nullable=True, index=True)
    status: Mapped[MilestoneStatus] = mapped_column(Enum(MilestoneStatus), default=MilestoneStatus.PENDING)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # Obligation register (G4): classification, which party owes it, whether it
    # recurs, the clause text it was drawn from, and whether AI extracted it.
    obligation_type: Mapped[str | None] = mapped_column(String(60), nullable=True)   # payment/report/renewal/sla/notice/other
    owner_party: Mapped[str | None] = mapped_column(String(20), nullable=True)       # us/counterparty/both
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    frequency: Mapped[str | None] = mapped_column(String(40), nullable=True)         # one_time/monthly/quarterly/annual…
    source_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    owner_user: Mapped["User | None"] = relationship("User", foreign_keys=[owner_user_id])
    contract: Mapped["Contract"] = relationship("Contract", foreign_keys=[contract_id])


class PaymentStatus(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    INVOICED = "INVOICED"
    PAID = "PAID"


class PaymentScheduleItem(Base):
    """A scheduled payment / milestone-billing line for a contract, tracked from
    scheduled → invoiced → paid with PO and invoice references, for spend and
    cash-flow reporting (G12)."""
    __tablename__ = "payment_schedule_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.sr_no"), index=True)
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    due_date: Mapped[object | None] = mapped_column(Date, nullable=True, index=True)
    amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    po_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    invoice_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.SCHEDULED)
    paid_date: Mapped[object | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    contract: Mapped["Contract"] = relationship("Contract", foreign_keys=[contract_id])


class CustomFieldDef(Base):
    """An admin-defined custom field for contracts (G7). Applies to all contract
    types, or only to a specific type. Values are stored on Contract.custom_fields
    keyed by `key`."""
    __tablename__ = "custom_field_defs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(60), index=True)          # stable machine key
    label: Mapped[str] = mapped_column(String(120))
    field_type: Mapped[str] = mapped_column(String(20), default="text")  # text/number/date/select/bool
    options: Mapped[list | None] = mapped_column(JSON, nullable=True)  # for select
    applies_to_type: Mapped[str | None] = mapped_column(String(80), nullable=True)  # None = all types
    required: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ReportDefinition(Base):
    """A saved, admin/analyst-defined report over the contract repository (G8):
    a set of filters + chosen columns, optionally emailed on a schedule."""
    __tablename__ = "report_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    filters: Mapped[dict | None] = mapped_column(JSON, nullable=True)     # {contract_type, status, department_id, …}
    columns: Mapped[list | None] = mapped_column(JSON, nullable=True)     # ordered list of column keys
    sort: Mapped[str | None] = mapped_column(String(60), nullable=True)   # column key
    schedule: Mapped[str] = mapped_column(String(20), default="none")     # none/daily/weekly/monthly
    schedule_day: Mapped[int | None] = mapped_column(Integer, nullable=True)  # weekly:0-6 / monthly:1-28
    recipients: Mapped[list | None] = mapped_column(JSON, nullable=True)  # list of email addresses
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class FxRate(Base):
    """Admin-maintained FX rate: how many units of the base currency one unit of
    `currency` is worth. Used to normalize portfolio value across currencies
    (G15). Offline — rates are entered by an admin, never fetched."""
    __tablename__ = "fx_rates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    currency: Mapped[str] = mapped_column(String(10), unique=True, index=True)
    rate_to_base: Mapped[float] = mapped_column(Numeric(18, 6), default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ApiToken(Base):
    """A hashed API token for the documented read-only REST API (G17). The raw
    token is shown once at creation; only its SHA-256 hash is stored."""
    __tablename__ = "api_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    prefix: Mapped[str] = mapped_column(String(16), index=True)   # first chars, for display/lookup
    token_hash: Mapped[str] = mapped_column(String(128), index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ContractRecipient(Base):
    __tablename__ = "contract_recipients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.sr_no"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    contract: Mapped[Contract] = relationship(back_populates="recipients")


class Notification(Base):
    """An in-app notification for a specific user (e.g. a new assignment)."""
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)  # in-app path, e.g. /contracts/12
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class RequestStatus(str, enum.Enum):
    """Lifecycle of a contract request from the intake form."""
    SUBMITTED = "SUBMITTED"
    IN_REVIEW = "IN_REVIEW"
    REJECTED = "REJECTED"
    CONVERTED = "CONVERTED"   # turned into a draft in the authoring workspace


class ContractRequest(Base):
    """A business user's request for a new contract (the CLM front door). Legal /
    authors triage it and convert it into an authoring draft."""
    __tablename__ = "contract_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    counterparty_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contract_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    estimated_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    needed_by: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[str] = mapped_column(String(10), default="normal")  # low|normal|high
    status: Mapped[RequestStatus] = mapped_column(Enum(RequestStatus), default=RequestStatus.SUBMITTED, index=True)
    requested_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    draft_id: Mapped[int | None] = mapped_column(ForeignKey("contract_drafts.id"), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    department: Mapped["Department | None"] = relationship()
    requested_by: Mapped["User | None"] = relationship(foreign_keys=[requested_by_id])
    assigned_to: Mapped["User | None"] = relationship(foreign_keys=[assigned_to_id])


class Task(Base):
    """A lightweight to-do assigned to a user, optionally anchored to a contract or
    draft — for cross-team coordination (Google-Docs-style task list)."""
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(400))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[str] = mapped_column(String(10), default="normal")  # low|normal|high
    status: Mapped[str] = mapped_column(String(10), default="open", index=True)  # open|done
    entity_type: Mapped[str | None] = mapped_column(String(30), nullable=True)  # contract|contract_draft
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    owner: Mapped["User | None"] = relationship(foreign_keys=[owner_id])
    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])


class SavedFilter(Base):
    """A named, per-user set of Contracts-list filter values, so users can
    save and re-apply their common views (e.g. "Legal expiring this quarter")."""
    __tablename__ = "saved_filters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    params: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------

class DuplicateCandidate(Base):
    __tablename__ = "duplicate_candidates"
    __table_args__ = (UniqueConstraint("contract_id", "matched_contract_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.sr_no"), index=True)
    matched_contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.sr_no"))
    reason: Mapped[str] = mapped_column(Text)
    score: Mapped[float] = mapped_column(Float, default=0)
    resolution: Mapped[DuplicateResolution] = mapped_column(
        Enum(DuplicateResolution), default=DuplicateResolution.PENDING, index=True
    )
    resolved_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------------------
# Reminder rules
# ---------------------------------------------------------------------------

class ReminderRule(Base):
    __tablename__ = "reminder_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    # e.g. [90, 60, 30, 15, 7, 1] — days before expiry
    offsets: Mapped[list] = mapped_column(JSON, default=list)
    # After the first offset fires, repeat every N days until expiry (null = off)
    periodicity_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Continue every N days after expiry until acknowledged/renewed (null = off)
    post_expiry_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # After N reminders with no acknowledgement, CC the escalation contact
    escalation_after: Mapped[int | None] = mapped_column(Integer, nullable=True)
    escalation_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    channels: Mapped[list] = mapped_column(JSON, default=lambda: ["email"])
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class RuleDepartmentMap(Base):
    __tablename__ = "rule_department_map"
    __table_args__ = (UniqueConstraint("department_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("reminder_rules.id"), index=True)
    department_id: Mapped[int] = mapped_column(ForeignKey("departments.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReminderLog(Base):
    __tablename__ = "reminder_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.sr_no"), index=True)
    rule_id: Mapped[int | None] = mapped_column(ForeignKey("reminder_rules.id"), nullable=True)
    recipient: Mapped[str] = mapped_column(String(255))
    channel: Mapped[str] = mapped_column(String(50), default="email")
    days_to_expiry: Mapped[int | None] = mapped_column(Integer, nullable=True)
    escalated: Mapped[bool] = mapped_column(Boolean, default=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    delivery_status: Mapped[str] = mapped_column(String(50), default="SENT")
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)


# ---------------------------------------------------------------------------
# Audit trail, templates, settings
# ---------------------------------------------------------------------------

class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entity_type: Mapped[str] = mapped_column(String(100), index=True)
    entity_id: Mapped[int] = mapped_column(Integer, index=True)
    action: Mapped[str] = mapped_column(String(100))
    field: Mapped[str | None] = mapped_column(String(255), nullable=True)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PromptTemplate(Base):
    __tablename__ = "prompt_templates"
    __table_args__ = (UniqueConstraint("name", "version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), default="contract_extraction")
    version: Mapped[int] = mapped_column(Integer, default=1)
    content: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True)
    subject: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


# ---------------------------------------------------------------------------
# Contract Authoring Module (drafting, templates, versions)
# ---------------------------------------------------------------------------

class DraftStatus(str, enum.Enum):
    """Lifecycle of an authored draft, distinct from the register ContractStatus.
    A draft becomes a real Contract row on finalize/execute."""
    DRAFT = "DRAFT"
    INTERNAL_REVIEW = "INTERNAL_REVIEW"
    SHARED_WITH_VENDOR = "SHARED_WITH_VENDOR"
    NEGOTIATION = "NEGOTIATION"
    INTERNAL_APPROVED = "INTERNAL_APPROVED"
    OUT_FOR_SIGNATURE = "OUT_FOR_SIGNATURE"
    EXECUTED = "EXECUTED"
    ON_HOLD = "ON_HOLD"
    ABANDONED = "ABANDONED"


class ContractTemplate(Base):
    """Reusable contract skeleton with placeholder merge fields and default field
    values. Versioned via parent_id lineage; one active version per lineage."""
    __tablename__ = "contract_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    contract_type: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # lineage: successive versions of the same logical template
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("contract_templates.id"), nullable=True)
    # ProseMirror/TipTap JSON document with mergeField nodes as placeholders
    body: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Default register-field values seeded into a new draft
    field_defaults: Mapped[dict | None] = mapped_column(JSON, default=dict)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    department: Mapped[Department | None] = relationship()


class ContractDraft(Base):
    """A contract being authored in-app. Holds the structured document and the
    same register fields the validation screen uses; finalizes into a Contract."""
    __tablename__ = "contract_drafts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(500), default="Untitled draft")
    contract_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    status: Mapped[DraftStatus] = mapped_column(Enum(DraftStatus), default=DraftStatus.DRAFT, index=True)

    # The 21-field register schema (+ currency/custom) as a JSON blob; mapped to
    # Contract columns on finalize. Kept as JSON so custom fields are supported.
    fields: Mapped[dict | None] = mapped_column(JSON, default=dict)
    # ProseMirror/TipTap JSON document
    document: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Denormalized for querying / duplicate detection / finalize
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id"), nullable=True, index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)

    # Provenance
    source_contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.sr_no"), nullable=True)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("contract_templates.id"), nullable=True)
    origin: Mapped[str | None] = mapped_column(String(20), nullable=True)  # scratch|duplicate|template
    # Renewal/amendment linking into an existing vendor renewal chain
    renews_contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.sr_no"), nullable=True)
    link_as: Mapped[str | None] = mapped_column(String(20), nullable=True)  # renewal|amendment

    # Monotonic revision for optimistic-concurrency autosave (bumped per save).
    rev: Mapped[int] = mapped_column(Integer, default=0)

    # Set once finalized into a register contract
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.sr_no"), nullable=True)

    # Set when the vendor accepts the current version (gates send-for-signature)
    vendor_accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Internal reviewer sign-off (optionally gates sharing with the vendor)
    internal_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    internal_reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    vendor: Mapped[Vendor | None] = relationship()
    department: Mapped[Department | None] = relationship()
    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])
    versions: Mapped[list["DraftVersion"]] = relationship(
        back_populates="draft", order_by="DraftVersion.version_no"
    )


class DraftReviewRequest(Base):
    """A request for one internal reviewer to review a draft, optionally scoped to
    a highlighted section. Multiple reviewers per draft are supported (one row
    each). Review is advisory: the author can still advance the draft to the
    vendor without waiting for these to complete."""
    __tablename__ = "draft_review_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("contract_drafts.id"), index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    requested_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # The highlighted section the author wants looked at (plain-text excerpt), plus
    # an optional instruction. Null excerpt = whole document.
    excerpt: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending|reviewed
    outcome: Mapped[str | None] = mapped_column(String(20), nullable=True)  # approved|changes_requested
    reviewer_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Google-Docs-style suggestion: the reviewer's proposed replacement for the
    # highlighted excerpt, which the author can accept (apply) or reject.
    suggested_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolution: Mapped[str | None] = mapped_column(String(20), nullable=True)  # accepted|rejected
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    reviewer: Mapped["User | None"] = relationship(foreign_keys=[reviewer_id])
    requested_by: Mapped["User | None"] = relationship(foreign_keys=[requested_by_id])
    messages: Mapped[list["DraftReviewMessage"]] = relationship(
        back_populates="request", order_by="DraftReviewMessage.created_at",
        cascade="all, delete-orphan",
    )


class DraftReviewMessage(Base):
    """A reply in a review-request thread — the back-and-forth between the author
    and the tagged reviewer (Google-Docs-style comment replies)."""
    __tablename__ = "draft_review_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    review_request_id: Mapped[int] = mapped_column(
        ForeignKey("draft_review_requests.id"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    request: Mapped["DraftReviewRequest"] = relationship(back_populates="messages")
    user: Mapped["User | None"] = relationship()


class DraftAttachment(Base):
    """A supporting document attached while a contract is being authored; migrated
    to a ContractAttachment when the draft is finalized (3.15)."""
    __tablename__ = "draft_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("contract_drafts.id"), index=True)
    filename: Mapped[str] = mapped_column(String(512))
    path: Mapped[str] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(50), default="other")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DraftVersion(Base):
    """An autosaved snapshot of a draft's document + fields, for history/diff/restore."""
    __tablename__ = "draft_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("contract_drafts.id"), index=True)
    version_no: Mapped[int] = mapped_column(Integer)
    document: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    fields: Mapped[dict | None] = mapped_column(JSON, default=dict)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    draft: Mapped["ContractDraft"] = relationship(back_populates="versions")


class DraftComment(Base):
    """Internal comment / note on a draft (optionally anchored to a clause block).
    Never exported to the vendor copy."""
    __tablename__ = "draft_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("contract_drafts.id"), index=True)
    block_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    clause_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    author: Mapped["User | None"] = relationship()


# ---------------------------------------------------------------------------
# Clause Intelligence & Clause Library (Module C)
# ---------------------------------------------------------------------------

class RiskPosture(str, enum.Enum):
    VENDOR_FAVOURABLE = "VENDOR_FAVOURABLE"
    BALANCED = "BALANCED"
    COMPANY_FAVOURABLE = "COMPANY_FAVOURABLE"


class ClauseStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    DEPRECATED = "DEPRECATED"


class ClauseLibraryEntry(Base):
    """A canonical clause identified by its clause type (e.g. 'Indemnity'),
    grouping one or more version variants learned from real contracts."""
    __tablename__ = "clause_library"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    clause_type: Mapped[str] = mapped_column(String(120), index=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    versions: Mapped[list["ClauseVersion"]] = relationship(
        back_populates="entry", order_by="ClauseVersion.id"
    )


class ClauseVersion(Base):
    """A specific variant of a clause: its text, how it differs from siblings,
    risk posture, approval status and usage. New clause texts either match an
    existing version (by normalized-text similarity) or become a new version."""
    __tablename__ = "clause_versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("clause_library.id"), index=True)
    label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    normalized: Mapped[str | None] = mapped_column(Text, nullable=True)  # for similarity matching
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)     # plain-language difference
    polished_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # AI-enhanced, author-editable
    is_curated: Mapped[bool] = mapped_column(Boolean, default=False, index=True)  # in the top-N curated set
    curated_rank: Mapped[int | None] = mapped_column(Integer, nullable=True)      # 1..N by usage
    # Playbook tier for negotiation: preferred 'standard' wording, acceptable
    # 'fallback' positions, and the 'walkaway' language Legal will not go past.
    # None = not part of the playbook. Drives deviation scoring (G3/B2).
    playbook_tier: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    risk_posture: Mapped[RiskPosture] = mapped_column(Enum(RiskPosture), default=RiskPosture.BALANCED)
    legal_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[ClauseStatus] = mapped_column(Enum(ClauseStatus), default=ClauseStatus.DRAFT)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    first_used: Mapped[object | None] = mapped_column(Date, nullable=True)
    last_used: Mapped[object | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    entry: Mapped["ClauseLibraryEntry"] = relationship(back_populates="versions")
    usages: Mapped[list["ClauseUsage"]] = relationship(back_populates="version")


class ClauseUsage(Base):
    """One occurrence of a clause version in a source contract (who/where/when)."""
    __tablename__ = "clause_usage"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("clause_versions.id"), index=True)
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.sr_no"), nullable=True, index=True)
    vendor_id: Mapped[int | None] = mapped_column(ForeignKey("vendors.id"), nullable=True, index=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    contract_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    signing_entity: Mapped[str | None] = mapped_column(String(255), nullable=True)
    effective_date: Mapped[object | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    version: Mapped["ClauseVersion"] = relationship(back_populates="usages")


# ---------------------------------------------------------------------------
# Vendor Collaboration & Change Tracking (Module D)
# ---------------------------------------------------------------------------

class ShareAccess(str, enum.Enum):
    VIEW = "VIEW"
    COMMENT = "COMMENT"
    SUGGEST = "SUGGEST"


class RoundStatus(str, enum.Enum):
    SHARED = "SHARED"
    RETURNED = "RETURNED"
    CLOSED = "CLOSED"


class ChangeType(str, enum.Enum):
    INSERT = "INSERT"
    DELETE = "DELETE"
    REPLACE = "REPLACE"
    COMMENT = "COMMENT"


class Disposition(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    COUNTERED = "COUNTERED"
    WITHDRAWN = "WITHDRAWN"


class NegotiationRound(Base):
    """One share→return cycle of a draft with a vendor. Permanently retained."""
    __tablename__ = "negotiation_rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("contract_drafts.id"), index=True)
    round_no: Mapped[int] = mapped_column(Integer)
    shared_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    shared_with: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[RoundStatus] = mapped_column(Enum(RoundStatus), default=RoundStatus.SHARED)
    base_document: Mapped[dict | None] = mapped_column(JSON, nullable=True)   # snapshot shared out
    cover_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    shared_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    returned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class VendorShareLink(Base):
    """A single-purpose, revocable, expiring token scoped to one draft and one
    vendor recipient. Vendors have no accounts — identity is the token."""
    __tablename__ = "vendor_share_links"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("contract_drafts.id"), index=True)
    round_id: Mapped[int | None] = mapped_column(ForeignKey("negotiation_rounds.id"), nullable=True)
    recipient_email: Mapped[str] = mapped_column(String(255))
    recipient_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    access: Mapped[ShareAccess] = mapped_column(Enum(ShareAccess), default=ShareAccess.SUGGEST)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    nudged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    otp_code: Mapped[str | None] = mapped_column(String(12), nullable=True)
    otp_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    otp_failures: Mapped[int] = mapped_column(Integer, default=0)
    watermark: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_download: Mapped[bool] = mapped_column(Boolean, default=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    open_count: Mapped[int] = mapped_column(Integer, default=0)
    last_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_ua: Mapped[str | None] = mapped_column(String(400), nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ContractActionToken(Base):
    """A single-use, no-login token embedded in an expiry-reminder email so the
    recipient can decide to renew or terminate a contract without an account.
    Unlike a vendor share link, there is no OTP — the token itself is the key."""
    __tablename__ = "contract_action_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    contract_id: Mapped[int] = mapped_column(ForeignKey("contracts.sr_no"), index=True)
    purpose: Mapped[str] = mapped_column(String(30), default="renewal_decision")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision: Mapped[str | None] = mapped_column(String(20), nullable=True)  # RENEW | TERMINATE
    result_draft_id: Mapped[int | None] = mapped_column(ForeignKey("contract_drafts.id"), nullable=True)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    open_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AiRun(Base):
    """One AI generation, recorded (I1).

    Legal-ops AI policy generally requires knowing what a model produced, which
    prompt and model version produced it, and whether a human accepted it. That
    record is also the only honest signal for whether quality is improving, so
    every AI-backed feature writes one of these.
    """
    __tablename__ = "ai_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    feature: Mapped[str] = mapped_column(String(60), index=True)   # summary/obligations/ask/redline…
    entity_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    prompt_version: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ai_used: Mapped[bool] = mapped_column(Boolean, default=False)  # false = deterministic fallback
    input_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    output: Mapped[str | None] = mapped_column(Text, nullable=True)
    tokens_in: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tokens_out: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    verified: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # citation check
    # The human verdict — the part that makes this an audit trail rather than a log.
    outcome: Mapped[str | None] = mapped_column(String(20), nullable=True)  # accepted/rejected/edited
    outcome_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    outcome_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    outcome_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)


class ApprovalToken(Base):
    """A single-use, no-login token letting a named approver decide an approval
    gate straight from the notification email (H4). Scoped to exactly one draft
    and one stage — it cannot be replayed or widened."""
    __tablename__ = "approval_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("contract_drafts.id"), index=True)
    stage_key: Mapped[str] = mapped_column(String(60))
    approver_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approver_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision: Mapped[str | None] = mapped_column(String(20), nullable=True)  # APPROVED | REJECTED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TrackedChange(Base):
    """A discrete vendor-proposed change (or comment) on a draft, and its
    internal disposition. The negotiation ledger is built from these."""
    __tablename__ = "tracked_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("contract_drafts.id"), index=True)
    round_id: Mapped[int | None] = mapped_column(ForeignKey("negotiation_rounds.id"), nullable=True, index=True)
    share_link_id: Mapped[int | None] = mapped_column(ForeignKey("vendor_share_links.id"), nullable=True)
    change_type: Mapped[ChangeType] = mapped_column(Enum(ChangeType), default=ChangeType.REPLACE)
    block_index: Mapped[int | None] = mapped_column(Integer, nullable=True)     # anchor in the doc
    clause_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    original_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    proposed_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    author_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rationale: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_commentary: Mapped[str | None] = mapped_column(Text, nullable=True)
    disposition: Mapped[Disposition] = mapped_column(Enum(Disposition), default=Disposition.PENDING)
    disposition_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    countered_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ChangeDispositionEvent(Base):
    """Normalized, append-only history of every disposition decision on a tracked
    change (3.13) — so the full accept/reject/counter trail is auditable rather
    than only the latest disposition on the change row."""
    __tablename__ = "change_disposition_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    change_id: Mapped[int] = mapped_column(ForeignKey("tracked_changes.id"), index=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("contract_drafts.id"), index=True)
    disposition: Mapped[Disposition] = mapped_column(Enum(Disposition))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    countered_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# ---------------------------------------------------------------------------
# E-Signature (Module E) + Approvals (Module F)
# ---------------------------------------------------------------------------

class EnvelopeStatus(str, enum.Enum):
    CREATED = "CREATED"
    SENT = "SENT"
    DELIVERED = "DELIVERED"
    VIEWED = "VIEWED"
    SIGNED = "SIGNED"
    COMPLETED = "COMPLETED"
    DECLINED = "DECLINED"
    VOIDED = "VOIDED"


class ApprovalStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ESignEnvelope(Base):
    """An e-signature envelope for a draft, behind a provider-agnostic layer."""
    __tablename__ = "esign_envelopes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("contract_drafts.id"), index=True)
    contract_id: Mapped[int | None] = mapped_column(ForeignKey("contracts.sr_no"), nullable=True)
    provider: Mapped[str] = mapped_column(String(40), default="mock")
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    status: Mapped[EnvelopeStatus] = mapped_column(Enum(EnvelopeStatus), default=EnvelopeStatus.CREATED)
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    signers: Mapped[list | None] = mapped_column(JSON, default=list)   # [{name,email,role,order}]
    document_pdf_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    signed_pdf_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    certificate_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # reminders/expiration/template
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    events: Mapped[list["EnvelopeEvent"]] = relationship(back_populates="envelope", order_by="EnvelopeEvent.id")


class EnvelopeEvent(Base):
    """A status/recipient event for an envelope (from provider webhooks)."""
    __tablename__ = "envelope_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    envelope_id: Mapped[int] = mapped_column(ForeignKey("esign_envelopes.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(60))
    recipient: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str | None] = mapped_column(String(60), nullable=True)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    envelope: Mapped["ESignEnvelope"] = relationship(back_populates="events")


class Approval(Base):
    """An approval gate on a draft (department / value-threshold / legal / finance)
    that may be required before sharing externally or sending for signature."""
    __tablename__ = "approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("contract_drafts.id"), index=True)
    gate: Mapped[str] = mapped_column(String(40))    # value_threshold | department | legal | finance
    status: Mapped[ApprovalStatus] = mapped_column(Enum(ApprovalStatus), default=ApprovalStatus.PENDING)
    approver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
