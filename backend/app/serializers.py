"""Manual serializers for API responses."""
from .models import Contract, DuplicateCandidate, IngestionFile, User, Vendor

# Register fields counted toward a contract's completeness score (vendor is
# counted separately since it can be an id or a raw name).
COMPLETENESS_FIELDS = [
    "signing_entity", "vendor_address", "start_date", "end_date", "contract_tenure",
    "department_id", "po_number", "contract_value", "iks_signing_authority",
    "vendor_signing_authority", "contract_service", "service_summary",
]


def contract_completeness(c: Contract) -> float:
    """Percentage of key register fields that are filled (0-100)."""
    filled = sum(1 for f in COMPLETENESS_FIELDS if getattr(c, f) not in (None, ""))
    filled += 1 if (c.vendor_id or c.vendor_name_raw) else 0
    return round(100 * filled / (len(COMPLETENESS_FIELDS) + 1), 1)


def user_out(u: User) -> dict:
    # `roles` is the full set the user holds (primary + extras), de-duplicated with
    # the primary first; `role` stays for backward compatibility.
    extras = [r for r in (u.extra_roles or []) if r and r != u.role.value]
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "role": u.role.value,
        "roles": [u.role.value] + extras,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


def ingestion_out(f: IngestionFile, min_confidence: float | None = None,
                  completeness: float | None = None) -> dict:
    return {
        "id": f.id,
        "filename": f.filename,
        "path": f.path,
        "subfolder": f.subfolder,
        "sha256": f.sha256,
        "size_bytes": f.size_bytes,
        "source": getattr(f, "source", "LOCAL") or "LOCAL",
        "external_id": getattr(f, "external_id", None),
        "status": f.status.value,
        "error": f.error,
        "duplicate_of_id": f.duplicate_of_id,
        "contract_id": f.contract_id,
        # Lowest per-field extraction confidence of the linked contract (0-1), so
        # the ingestion log can flag low-confidence extractions for retry.
        "min_confidence": min_confidence,
        "low_confidence": (min_confidence is not None and min_confidence < 0.8),
        # Percentage of key register fields filled on the linked contract.
        "completeness": completeness,
        "input_tokens": getattr(f, "input_tokens", None),
        "output_tokens": getattr(f, "output_tokens", None),
        "total_tokens": (
            (f.input_tokens or 0) + (f.output_tokens or 0)
            if (getattr(f, "input_tokens", None) is not None or getattr(f, "output_tokens", None) is not None)
            else None
        ),
        "detected_at": f.detected_at.isoformat() if f.detected_at else None,
        "processed_at": f.processed_at.isoformat() if f.processed_at else None,
    }


def vendor_out(v: Vendor, contract_count: int | None = None) -> dict:
    out = {
        "id": v.id,
        "name": v.name,
        "normalized_name": v.normalized_name,
        "addresses": v.addresses or [],
        "contacts": v.contacts or [],
        "aliases": [a.alias for a in v.aliases],
        "risk_rating": v.risk_rating,
        "risk_notes": v.risk_notes,
    }
    if contract_count is not None:
        out["contract_count"] = contract_count
    return out


def contract_out(c: Contract, detail: bool = False) -> dict:
    out = {
        "sr_no": c.sr_no,
        "signing_entity": c.signing_entity,
        "vendor_id": c.vendor_id,
        "vendor_name": c.vendor.name if c.vendor else c.vendor_name_raw,
        "vendor_address": c.vendor_address,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "contract_tenure": c.contract_tenure,
        "department_id": c.department_id,
        "department_name": c.department.name if c.department else None,
        "po_number": c.po_number,
        "contract_value": float(c.contract_value) if c.contract_value is not None else None,
        "currency": c.currency,
        "iks_signing_authority": c.iks_signing_authority,
        "vendor_signing_authority": c.vendor_signing_authority,
        "contract_service": c.contract_service,
        "service_summary": c.service_summary,
        "payment_term": c.payment_term,
        "notice_period": c.notice_period,
        "contract_link": c.contract_link,
        "contract_type": c.contract_type,
        "location": c.location,
        "phi_shared": c.phi_shared,
        "tags": [
            {"id": t.id, "name": t.name, "color": t.color}
            for t in c.tags if t.deleted_at is None
        ],
        "status": c.status.value,
        "lifecycle_status": c.lifecycle_status.value,
        "derived_fields": c.derived_fields or [],
        "learned_fields": c.learned_fields or [],
        "confidence": c.confidence or {},
        "renews_contract_id": c.renews_contract_id,
        "thread_id": c.thread_id,
        "group_id": c.group_id,
        "assignee_id": c.assignee_id,
        "assignee_name": c.assignee.name if c.assignee else None,
        "legal_hold": bool(c.legal_hold),
        "risk_score": c.risk_score,
        "risk_level": c.risk_level,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
    if detail:
        out.update({
            "ai_summary": c.ai_summary,
            "ai_key_terms": c.ai_key_terms or [],
            "ai_indexed_at": c.ai_indexed_at.isoformat() if c.ai_indexed_at else None,
            "savings_amount": float(c.savings_amount) if c.savings_amount is not None else None,
            "custom_fields": c.custom_fields or {},
            "legal_hold_reason": c.legal_hold_reason,
            "legal_hold_at": c.legal_hold_at.isoformat() if c.legal_hold_at else None,
            "line_items": c.line_items or [],
            "raw_extracted": c.raw_extracted,
            "extraction_model": c.extraction_model,
            "prompt_version": c.prompt_version,
            "validated_by_id": c.validated_by_id,
            "validated_at": c.validated_at.isoformat() if c.validated_at else None,
            "rejection_reason": c.rejection_reason,
            "reminder_rule_id": c.reminder_rule_id,
            "custom_offsets": c.custom_offsets,
            "escalation_after": c.escalation_after,
            "escalation_email": c.escalation_email,
            # Department default recipient — inherited when the contract has no recipients
            "department_default_recipient_email": (
                c.department.default_recipient_email if c.department else None
            ),
            "reminders_acknowledged": c.reminders_acknowledged,
            "reminders_snoozed_until": c.reminders_snoozed_until.isoformat() if c.reminders_snoozed_until else None,
            "ingestion_file_id": c.ingestion_file_id,
            "recipients": [
                {
                    "id": r.id,
                    "name": r.name,
                    "email": r.email,
                    "is_primary": r.is_primary,
                    "user_id": r.user_id,
                }
                for r in c.recipients
                if r.deleted_at is None
            ],
        })
    return out


def duplicate_out(d: DuplicateCandidate, contract: Contract | None, matched: Contract | None) -> dict:
    return {
        "id": d.id,
        "contract_id": d.contract_id,
        "matched_contract_id": d.matched_contract_id,
        "reason": d.reason,
        "score": d.score,
        "resolution": d.resolution.value,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "contract": contract_out(contract) if contract else None,
        "matched_contract": contract_out(matched) if matched else None,
    }
