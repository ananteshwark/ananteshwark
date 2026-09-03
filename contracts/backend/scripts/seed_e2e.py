"""Seed the browser E2E scenarios. Dev/CI only — never run against real data.

Creates a contract whose PDF really is on disk and whose extracted text really
is what that PDF contains, so the risk pipeline has something to anchor to:
extraction -> segmentation -> risk match -> anchor -> shaded box. Wording is
chosen to trip the deterministic patterns in services/contract_risk, so the
specs assert on real findings rather than fixtures.

    cd backend && DATABASE_URL=sqlite:////tmp/e2e.db python scripts/seed_e2e.py

Prints the seeded ids as JSON; the specs read E2E_CONTRACT_SR.
"""
import io
import json
import os
import pathlib
import sys
from datetime import date

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from PIL import Image  # noqa: E402

from app.auth import hash_password  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import ensure_internal_entities  # noqa: E402
from app.migrations import run_migrations  # noqa: E402
from app.models import (  # noqa: E402
    Contract, ContractDraft, ContractStatus, Department, InternalEntity,
    LifecycleStatus, User, UserRole, Vendor,
)
from app.services.letterhead import save_image  # noqa: E402
from app.services.master_lists import set_lists  # noqa: E402
from app.services.pdf import text_to_pdf  # noqa: E402
from app.services.text_extraction import extract_text  # noqa: E402

E2E_EMAIL = os.environ.get("E2E_EMAIL", "admin@example.com")
E2E_PASSWORD = os.environ.get("E2E_PASSWORD", "adminpass123")

BODY = """1. Term and Renewal
This Agreement shall commence on 1 January 2026 and shall automatically renew
for successive one-year terms unless notice is given ninety days in advance.

2. Indemnity
The Company shall indemnify and hold harmless the Vendor against any and all
claims arising out of or relating to the services provided under this Agreement.

3. Limitation of Liability
In no event shall the Vendor be liable for any indirect, incidental or
consequential damages. The Vendor's total liability shall not exceed the fees
paid in the preceding twelve months.

4. Warranties
The services are provided as-is. The Vendor disclaims all warranties, express
or implied, including any warranty of merchantability or fitness for purpose.

5. Fees
All fees are non-refundable. The Vendor may increase the fees on thirty days
written notice, at the sole discretion of the Vendor.

6. Termination
The Company shall not terminate this Agreement for convenience during the
initial term.
"""

# Usable against an empty database, so the whole setup is one command.
Base.metadata.create_all(bind=engine)
run_migrations()
# The internal-entity catalogue is populated by the app's startup, not by
# create_all. Bulk validate refuses a signing entity that is not in it, so the
# seed has to do the same thing the app does or nothing here can be validated.
ensure_internal_entities()

out = pathlib.Path("/tmp/e2e-docs"); out.mkdir(exist_ok=True)
pdf_path = out / "e2e-contract.pdf"
pdf_path.write_bytes(text_to_pdf("Master Services Agreement", BODY))

db = SessionLocal()

# The login the specs use. Seeded here so one command sets up everything.
if not db.query(User).filter(User.email == E2E_EMAIL).first():
    db.add(User(email=E2E_EMAIL, name="E2E Admin", role=UserRole.SUPER_ADMIN,
                hashed_password=hash_password(E2E_PASSWORD)))
    db.commit()

# Two reviewers for the multi-reviewer spec. Plain VIEWERs on purpose: a
# review can be sent to anyone, and a reviewer who holds no authoring role is
# the case that had no coverage.
for email, name in (("e2e-reviewer-one@example.com", "E2E Reviewer One"),
                    ("e2e-reviewer-two@example.com", "E2E Reviewer Two")):
    if not db.query(User).filter(User.email == email).first():
        db.add(User(email=email, name=name, role=UserRole.VIEWER,
                    hashed_password=hash_password(E2E_PASSWORD)))
db.commit()

v = db.query(Vendor).filter(Vendor.name == "E2E Vendor Ltd").first()
if v is None:
    v = Vendor(name="E2E Vendor Ltd", normalized_name="e2e vendor ltd"); db.add(v); db.flush()

c = db.query(Contract).filter(Contract.vendor_name_raw == "E2E Vendor Ltd").first()
if c is None:
    c = Contract(vendor_id=v.id, vendor_name_raw="E2E Vendor Ltd",
                 contract_service="Managed services", contract_type="MSA",
                 status=ContractStatus.VALIDATED, lifecycle_status=LifecycleStatus.ACTIVE,
                 contract_link=str(pdf_path), raw_extracted={}, confidence={})
    db.add(c)
c.contract_link = str(pdf_path)
# Extracted text must be what the PDF actually contains, or nothing can anchor.
c.extracted_text = extract_text(str(pdf_path))
db.commit()
sr = c.sr_no

# A pending contract for the validation-queue spec. Every mandatory field is
# filled (see MANDATORY_FIELDS in api/contracts_api): "Validate complete"
# skips rows that are missing any of them, so an incomplete row would make the
# spec assert on a no-op.
# The signing entity must be one the install actually knows: bulk validate
# refuses "signing entity is not a predefined internal entity". Take whatever
# the seeded catalogue holds rather than inventing a name.
entity = db.query(InternalEntity).filter(InternalEntity.deleted_at.is_(None)).first()
SIGNING_ENTITY = entity.name if entity else None

dept = db.query(Department).filter(Department.name == "E2E Department").first()
if dept is None:
    dept = Department(name="E2E Department"); db.add(dept); db.flush()

p = db.query(Contract).filter(Contract.vendor_name_raw == "E2E Pending Ltd").first()
if p is None:
    p = Contract(vendor_name_raw="E2E Pending Ltd", contract_service="Pending service",
                 contract_type="NDA", status=ContractStatus.PENDING_VALIDATION,
                 lifecycle_status=LifecycleStatus.ACTIVE,
                 signing_entity=SIGNING_ENTITY, department_id=dept.id,
                 po_number="PO-E2E-0001",
                 start_date=date(2026, 1, 1), end_date=date(2027, 1, 1),
                 contract_link=str(pdf_path), raw_extracted={}, confidence={},
                 extracted_text=c.extracted_text)
    db.add(p)
# Reset on every run: the validation spec validates this contract, so without
# this the setup is single-use and the second run of the suite fails on a row
# that is no longer in the queue.
p.status = ContractStatus.PENDING_VALIDATION
p.validated_at = None
db.commit()
pending_sr = p.sr_no

# Two business units on different letterheads, for the letterhead spec. Two
# rather than one because the property worth asserting in a browser is that the
# BU picks the paper — a single letterhead would pass even if the lookup were
# hard-coded. The artwork is generated here so the repository carries no
# binaries and the colours are known to the spec.
E2E_BUS = {"E2E Alpha BU": (10, 60, 120), "E2E Beta BU": (130, 25, 25)}
set_lists(db, {"business_units": sorted(E2E_BUS)})
draft_ids = {}
for name, colour in E2E_BUS.items():
    buf = io.BytesIO()
    Image.new("RGB", (1600, 280), colour).save(buf, format="PNG")
    save_image(db, name, "header", buf.getvalue())
    draft = db.query(ContractDraft).filter(ContractDraft.title == f"{name} draft").first()
    if draft is None:
        draft = ContractDraft(title=f"{name} draft", contract_type="MSA", origin="scratch")
        db.add(draft)
    draft.fields = {"location": name}
    draft.document = {"type": "doc", "content": [
        {"type": "paragraph",
         "content": [{"type": "text", "text": "This Agreement is made between the parties. " * 20}]}]}
    db.flush()
    draft_ids[name] = draft.id
db.commit()
db.close()
print(json.dumps({"sr_no": sr, "pending_sr": pending_sr, "pdf": str(pdf_path),
                  "signing_entity": SIGNING_ENTITY,
                  "reviewers": ["e2e-reviewer-one@example.com",
                                "e2e-reviewer-two@example.com"],
                  "letterhead_drafts": draft_ids,
                  "chars": len(c.extracted_text or "")}))
