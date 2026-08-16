"""Background extraction worker: pulls queued ingestion files, extracts text,
calls Claude, and creates PENDING_VALIDATION contract records."""
import logging
import queue
import threading
import time

from ..database import SessionLocal
from ..models import (
    Contract,
    ContractStatus,
    IngestionFile,
    IngestionStatus,
    PromptTemplate,
    Tag,
    Vendor,
    VendorAlias,
    utcnow,
)
from .extraction import ExtractionError, extract_contract_data
from .dates import derive_dates, normalize_tenure, parse_date, tenure_from_dates
from .text_extraction import TextExtractionError, extract_text
from .vendor_matching import normalize_vendor_name

log = logging.getLogger(__name__)

extraction_queue: "queue.Queue[int]" = queue.Queue()

# Master switch for AI extraction. When cleared, the worker leaves queued files
# untouched (they wait) instead of extracting them. Set = extraction runs.
_extraction_enabled = threading.Event()
_extraction_enabled.set()


def set_extraction_enabled(enabled: bool) -> None:
    """Pause/resume AI extraction at runtime (driven by the admin setting)."""
    if enabled:
        _extraction_enabled.set()
    else:
        _extraction_enabled.clear()


def extraction_enabled() -> bool:
    return _extraction_enabled.is_set()


# Ingestion ids that should be re-processed with the secondary extractor. Set by
# a "Retry with 2nd AI" request before the id is enqueued; consumed once here.
_secondary_requests: set[int] = set()


def request_secondary_retry(ingestion_id: int) -> None:
    _secondary_requests.add(ingestion_id)


def _resolve_or_create_vendor(db, name: str | None) -> int | None:
    """Match the extracted vendor name to a master vendor (by normalized name or
    alias); create a new master vendor when none exists. Returns the vendor id."""
    raw = (name or "").strip()
    norm = normalize_vendor_name(raw)
    if not norm:
        return None
    existing = (
        db.query(Vendor)
        .filter(Vendor.normalized_name == norm, Vendor.deleted_at.is_(None))
        .first()
    )
    if existing:
        return existing.id
    alias = (
        db.query(VendorAlias)
        .join(Vendor, Vendor.id == VendorAlias.vendor_id)
        .filter(VendorAlias.normalized_alias == norm, Vendor.deleted_at.is_(None))
        .first()
    )
    if alias:
        return alias.vendor_id
    vendor = Vendor(name=raw, normalized_name=norm)
    db.add(vendor)
    db.flush()
    from ..audit import log_action

    log_action(db, "vendor", vendor.id, "AUTO_CREATE", user_id=None,
               new_value=f"Auto-added from scanned contract: {raw}")
    log.info("Auto-created vendor #%s from extraction: %s", vendor.id, raw)
    return vendor.id


def _apply_ai_tags(db, contract, tag_names) -> None:
    """Link the AI-suggested tags to the contract, matching existing tags by
    name (case-insensitive) and creating new ones as needed."""
    if not isinstance(tag_names, list):
        return
    existing = {t.name.lower(): t for t in db.query(Tag).filter(Tag.deleted_at.is_(None)).all()}
    current = {t.id for t in contract.tags}
    for raw in tag_names:
        name = (raw or "").strip()[:80] if isinstance(raw, str) else ""
        if not name:
            continue
        tag = existing.get(name.lower())
        if tag is None:
            tag = Tag(name=name)
            db.add(tag)
            db.flush()
            existing[name.lower()] = tag
        if tag.id not in current:
            contract.tags.append(tag)
            current.add(tag.id)


def get_active_prompt(db) -> PromptTemplate | None:
    return (
        db.query(PromptTemplate)
        .filter(PromptTemplate.name == "contract_extraction")
        .filter(PromptTemplate.is_active.is_(True))
        .order_by(PromptTemplate.version.desc())
        .first()
    )


def process_file(ingestion_id: int) -> None:
    use_secondary = ingestion_id in _secondary_requests
    _secondary_requests.discard(ingestion_id)
    db = SessionLocal()
    try:
        record = db.get(IngestionFile, ingestion_id)
        if record is None or record.status not in (
            IngestionStatus.QUEUED,
            IngestionStatus.FAILED,
        ):
            return
        record.status = IngestionStatus.EXTRACTING
        record.error = None
        db.commit()

        try:
            text = extract_text(record.path)
        except (TextExtractionError, OSError) as exc:
            _mark_failed(db, record, f"Text extraction failed: {exc}")
            return

        prompt = get_active_prompt(db)
        if prompt is None:
            _mark_failed(db, record, "No active extraction prompt template configured")
            return

        try:
            result = extract_contract_data(text, prompt.content, use_secondary=use_secondary)
        except ExtractionError as exc:
            _mark_failed(db, record, str(exc))
            return

        record.status = IngestionStatus.EXTRACTED
        usage = result.get("usage") or {}
        record.input_tokens = usage.get("input_tokens")
        record.output_tokens = usage.get("output_tokens")
        db.commit()

        data = result["data"]

        # Deterministic guard: never record a known organization entity as the
        # vendor, and normalize the signing entity to its exact canonical name.
        from .internal_entities import canonicalize_signing_entity, flat_names
        from .org_entities import apply_org_entity_guard
        from .settings_store import get_setting

        legacy = get_setting(db, "organization_entities")
        org_names = ", ".join(flat_names(db, legacy))  # canonical names + aliases
        data, org_corrected = apply_org_entity_guard(data, org_names)
        data, entity_canonicalized = canonicalize_signing_entity(db, data, legacy)

        start = parse_date(data.get("start_date"))
        end = parse_date(data.get("end_date"))
        start, end, derived = derive_dates(start, end, data.get("contract_tenure"))
        # Tenure is always expressed in months/years: prefer the value computed
        # from the dates, else normalize whatever was extracted.
        tenure = tenure_from_dates(start, end) or normalize_tenure(data.get("contract_tenure"))
        if org_corrected:
            # Flag both parties for validator review (highlighted like derived fields;
            # field names match the validation form: vendor_name_raw, signing_entity)
            derived = sorted(set(derived) | {"signing_entity", "vendor_name_raw"})
        if entity_canonicalized:
            derived = sorted(set(derived) | {"signing_entity"})

        # Vendor master auto-population: link (or create) a master vendor from the
        # scanned contract so newly found vendors are added automatically.
        vendor_id = _resolve_or_create_vendor(db, data.get("vendor"))

        contract = Contract(
            signing_entity=data.get("signing_entity"),
            vendor_id=vendor_id,
            vendor_name_raw=data.get("vendor"),
            vendor_address=data.get("vendor_address"),
            start_date=start,
            end_date=end,
            contract_tenure=tenure,
            po_number=data.get("po_number"),
            contract_value=data.get("contract_value"),
            currency=data.get("currency") or "INR",
            iks_signing_authority=data.get("iks_signing_authority"),
            vendor_signing_authority=data.get("vendor_signing_authority"),
            contract_service=data.get("contract_service"),
            service_summary=data.get("service_summary"),
            payment_term=data.get("payment_term"),
            notice_period=data.get("notice_period"),
            contract_type=data.get("contract_type"),
            location=data.get("location"),
            line_items=data.get("line_items") or [],
            contract_link=record.path,  # auto-filled by the system, never extracted
            status=ContractStatus.PENDING_VALIDATION,
            raw_extracted=data,
            extracted_text=text[:200_000],  # for full-text search
            confidence=result["confidence"],
            derived_fields=derived,
            extraction_model=result.get("model"),
            prompt_version=prompt.version,
            ingestion_file_id=record.id,
        )
        db.add(contract)
        db.flush()
        _apply_ai_tags(db, contract, data.get("tags"))

        # Learning layer: auto-fill any still-empty stable fields from what
        # validators have historically recorded for this vendor. Filled fields
        # are flagged so the validation form marks them "from history — review".
        from .field_learning import autofill_from_history

        learned = autofill_from_history(db, contract)
        if learned:
            contract.learned_fields = learned
            from ..audit import log_action

            log_action(
                db, "contract", contract.sr_no, "AUTOFILL_FROM_HISTORY", user_id=None,
                new_value="Filled from vendor history: " + ", ".join(learned),
            )
            log.info("Auto-filled %s from history for contract %s", learned, contract.sr_no)
        if org_corrected:
            from ..audit import log_action

            log_action(
                db, "contract", contract.sr_no, "AUTO_CORRECT_ORG_ENTITY", user_id=None,
                new_value="Swapped vendor/signing entity: an organization entity was extracted as the vendor",
            )
        record.contract_id = contract.sr_no
        record.status = IngestionStatus.PENDING_VALIDATION
        record.processed_at = utcnow()
        db.commit()
        log.info("Extracted %s -> contract sr_no=%s", record.filename, contract.sr_no)
    except Exception:
        log.exception("Unexpected error processing ingestion %s", ingestion_id)
        db.rollback()
        record = db.get(IngestionFile, ingestion_id)
        if record is not None:
            _mark_failed(db, record, "Internal error during extraction (see server logs)")
    finally:
        db.close()


def _mark_failed(db, record, message: str) -> None:
    """Mark an ingestion record FAILED, persist it, and alert admins (best-effort)."""
    record.status = IngestionStatus.FAILED
    record.error = message
    db.commit()
    try:
        from .failure_alerts import notify_extraction_failure

        notify_extraction_failure(db, record, message)
    except Exception:
        log.exception("Extraction-failure alert error for ingestion %s", record.id)


def _worker_loop():
    while True:
        # While extraction is paused, don't consume the queue — queued files wait.
        if not _extraction_enabled.is_set():
            time.sleep(1.0)
            continue
        try:
            ingestion_id = extraction_queue.get(timeout=1.0)
        except queue.Empty:
            continue
        if ingestion_id is None:  # shutdown sentinel
            break
        process_file(ingestion_id)
        extraction_queue.task_done()


def start_worker() -> threading.Thread:
    # Initialize the pause flag from the persisted setting.
    try:
        db = SessionLocal()
        try:
            from .settings_store import get_setting
            set_extraction_enabled(get_setting(db, "extraction_enabled") != "false")
        finally:
            db.close()
    except Exception:
        pass
    thread = threading.Thread(target=_worker_loop, daemon=True, name="extraction-worker")
    thread.start()
    # Re-queue anything left mid-flight from a previous run
    db = SessionLocal()
    try:
        for record in (
            db.query(IngestionFile)
            .filter(IngestionFile.status.in_([IngestionStatus.QUEUED, IngestionStatus.EXTRACTING]))
            .all()
        ):
            if record.status == IngestionStatus.EXTRACTING:
                record.status = IngestionStatus.QUEUED
            extraction_queue.put(record.id)
        db.commit()
    finally:
        db.close()
    return thread
