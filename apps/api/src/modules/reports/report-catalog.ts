import { Employee } from '../hr/employees/entities/employee.entity';
import { LeaveApplication } from '../hr/leave/entities/leave-application.entity';
import { ExitRequest } from '../hr/exits/entities/exit-request.entity';
import { Applicant } from '../talent/ats/entities/applicant.entity';
import { JobPosting } from '../talent/ats/entities/job-posting.entity';
import { JobOffer } from '../talent/ats/entities/job-offer.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { Bill } from '../finance/ap/entities/bill.entity';
import { JournalEntry } from '../finance/gl/entities/journal-entry.entity';
import { PayrollRun } from '../payroll/runs/entities/payroll-run.entity';
import { Payslip } from '../payroll/runs/entities/payslip.entity';
import { PurchaseOrder } from '../procurement/po/entities/purchase-order.entity';
import { PurchaseRequisition } from '../procurement/requisition/entities/purchase-requisition.entity';
import { VendorInvoice } from '../procurement/vendor-invoice/entities/vendor-invoice.entity';
import { Item } from '../inventory/entities/item.entity';
import { CrmOpportunity } from '../crm/entities/crm-opportunity.entity';
import { ServiceTicket } from '../crm/entities/service-ticket.entity';
import { SalesOrder } from '../sales/entities/sales-order.entity';
import { ExpenseClaim } from '../expenses/entities/expense-claim.entity';
import { TravelRequest } from '../travel/entities/travel-request.entity';
import { HrCase } from '../helpdesk/entities/hr-case.entity';
import { Recognition } from '../engagement/entities/recognition.entity';
import { Survey } from '../engagement/entities/survey.entity';
import { Contract } from '../contracts/entities/contract.entity';
import { Project } from '../projects/entities/project.entity';
import { KbArticle } from '../knowledge/entities/knowledge.entity';
import { MeritLine } from '../compensation/merit/entities/merit-line.entity';
import { LicenseInvoice } from '../licensing/entities/license-invoice.entity';
import { ConsumptionRecord } from '../licensing/entities/consumption-record.entity';
import { Customer } from '../finance/ar/entities/customer.entity';
import { Vendor } from '../finance/ap/entities/vendor.entity';

/**
 * Declarative report registry: one entry per report, grouped by module.
 * The engine derives EVERY column of the backing entity from TypeORM
 * metadata, so each report automatically exposes all its fields as
 * filterable/sortable columns with type-aware operators — adding a report
 * is one entry here, no query code.
 *
 * `permission` gates the report (checked dynamically per user) and
 * `excludeColumns` hides sensitive fields from output AND filtering.
 */
export interface ReportLookup {
  /** ID column on the report entity to resolve (e.g. customerId). */
  field: string;
  /** Entity holding the display label; resolved tenant-scoped by id. */
  entity: Function;
  /** Fields joined with a space to form the label (e.g. first + last name). */
  labelFields: string[];
}

export interface ReportDefinition {
  code: string;
  module: string;
  name: string;
  description: string;
  entity: Function;
  permission: string;
  excludeColumns?: string[];
  defaultSort?: string;
  /** ID columns enriched with a read-only `<field>Label` display column. */
  lookups?: ReportLookup[];
}

const EMPLOYEE_LOOKUP: ReportLookup = { field: 'employeeId', entity: Employee, labelFields: ['firstName', 'lastName'] };
const CUSTOMER_LOOKUP: ReportLookup = { field: 'customerId', entity: Customer, labelFields: ['name'] };
const VENDOR_LOOKUP: ReportLookup = { field: 'vendorId', entity: Vendor, labelFields: ['name'] };

export const REPORT_CATALOG: ReportDefinition[] = [
  // ── HR ────────────────────────────────────────────────────────────────────
  { code: 'hr-employees', module: 'hr', name: 'Employee Directory', description: 'All employees with status, org placement and joining details', entity: Employee, permission: 'hr:employees:read', excludeColumns: ['pan', 'bankAccountNumber'] },
  { code: 'hr-leave-applications', module: 'hr', name: 'Leave Applications', description: 'Leave requests by type, status and date range', entity: LeaveApplication, permission: 'hr:leave:read', lookups: [EMPLOYEE_LOOKUP] },
  { code: 'hr-exits', module: 'hr', name: 'Exit Requests', description: 'Exits by reason, status and last working date', entity: ExitRequest, permission: 'hr:employees:read', lookups: [EMPLOYEE_LOOKUP] },

  // ── Talent ────────────────────────────────────────────────────────────────
  { code: 'talent-applicants', module: 'talent', name: 'Applicants', description: 'Candidate pipeline by stage, source and posting', entity: Applicant, permission: 'talent:ats:read', lookups: [{ field: 'jobPostingId', entity: JobPosting, labelFields: ['title'] }] },
  { code: 'talent-job-postings', module: 'talent', name: 'Job Postings', description: 'Open and closed job postings', entity: JobPosting, permission: 'talent:ats:read' },
  { code: 'talent-job-offers', module: 'talent', name: 'Job Offers', description: 'Offers by status and validity', entity: JobOffer, permission: 'talent:ats:read' },

  // ── Finance ───────────────────────────────────────────────────────────────
  { code: 'finance-ar-invoices', module: 'finance', name: 'AR Invoices', description: 'Customer invoices by status, due date and balance', entity: Invoice, permission: 'finance:ar:read', lookups: [CUSTOMER_LOOKUP] },
  { code: 'finance-ap-bills', module: 'finance', name: 'AP Bills', description: 'Vendor bills by status and due date', entity: Bill, permission: 'finance:ap:read', lookups: [VENDOR_LOOKUP] },
  { code: 'finance-journal-entries', module: 'finance', name: 'Journal Entries', description: 'GL journals by status, period and source', entity: JournalEntry, permission: 'finance:journal:read' },

  // ── Payroll ───────────────────────────────────────────────────────────────
  { code: 'payroll-runs', module: 'payroll', name: 'Payroll Runs', description: 'Runs by period and status', entity: PayrollRun, permission: 'payroll:runs:read' },
  { code: 'payroll-payslips', module: 'payroll', name: 'Payslips', description: 'Payslips by run, employee and period', entity: Payslip, permission: 'payroll:payslips:read', lookups: [EMPLOYEE_LOOKUP] },

  // ── Procurement ───────────────────────────────────────────────────────────
  { code: 'procurement-purchase-orders', module: 'procurement', name: 'Purchase Orders', description: 'POs by vendor, status and amount', entity: PurchaseOrder, permission: 'procurement:po:read', lookups: [VENDOR_LOOKUP] },
  { code: 'procurement-requisitions', module: 'procurement', name: 'Purchase Requisitions', description: 'Requisitions by status and requester', entity: PurchaseRequisition, permission: 'procurement:requisitions:read' },
  { code: 'procurement-vendor-invoices', module: 'procurement', name: 'Vendor Invoices', description: 'Vendor invoices by match status', entity: VendorInvoice, permission: 'procurement:read', lookups: [VENDOR_LOOKUP] },

  // ── Inventory ─────────────────────────────────────────────────────────────
  { code: 'inventory-items', module: 'inventory', name: 'Item Master', description: 'Items by category, type and status', entity: Item, permission: 'inventory:items:read' },

  // ── CRM ───────────────────────────────────────────────────────────────────
  { code: 'crm-opportunities', module: 'crm', name: 'Opportunities', description: 'Pipeline by stage, owner and value', entity: CrmOpportunity, permission: 'crm:contacts:read' },
  { code: 'crm-service-tickets', module: 'crm', name: 'Service Tickets', description: 'Tickets by status, priority and SLA breach', entity: ServiceTicket, permission: 'crm:contacts:read' },

  // ── Sales ─────────────────────────────────────────────────────────────────
  { code: 'sales-orders', module: 'sales', name: 'Sales Orders', description: 'Orders by customer, status and value', entity: SalesOrder, permission: 'sales:orders:read', lookups: [CUSTOMER_LOOKUP] },

  // ── Expenses & Travel ─────────────────────────────────────────────────────
  { code: 'expenses-claims', module: 'expenses', name: 'Expense Claims', description: 'Claims by employee, status and amount', entity: ExpenseClaim, permission: 'expenses:claims:read', lookups: [EMPLOYEE_LOOKUP] },
  { code: 'expenses-travel-requests', module: 'expenses', name: 'Travel Requests', description: 'Travel requests by status and dates', entity: TravelRequest, permission: 'expenses:travel:read', lookups: [EMPLOYEE_LOOKUP] },

  // ── Helpdesk ──────────────────────────────────────────────────────────────
  { code: 'helpdesk-cases', module: 'helpdesk', name: 'HR Helpdesk Cases', description: 'Cases by category, status and SLA', entity: HrCase, permission: 'hr:helpdesk:read' },

  // ── Engagement ────────────────────────────────────────────────────────────
  { code: 'engagement-recognitions', module: 'engagement', name: 'Recognitions', description: 'Recognition activity by badge and recipient', entity: Recognition, permission: 'hr:recognition:read' },
  { code: 'engagement-surveys', module: 'engagement', name: 'Surveys', description: 'Surveys by status and window', entity: Survey, permission: 'hr:surveys:read' },

  // ── Contracts ─────────────────────────────────────────────────────────────
  { code: 'contracts-contracts', module: 'contracts', name: 'Contracts', description: 'Contracts by status, party and end date', entity: Contract, permission: 'contracts:read' },

  // ── Projects ──────────────────────────────────────────────────────────────
  { code: 'projects-projects', module: 'projects', name: 'Projects', description: 'Projects by status, dates and budget', entity: Project, permission: 'projects:read' },

  // ── Knowledge ─────────────────────────────────────────────────────────────
  { code: 'knowledge-articles', module: 'knowledge', name: 'KB Articles', description: 'Articles by status, category and votes', entity: KbArticle, permission: 'knowledge:read' },

  // ── Compensation ──────────────────────────────────────────────────────────
  { code: 'compensation-merit-lines', module: 'compensation', name: 'Merit Worksheet Lines', description: 'Merit lines by plan, rating and proposed increase', entity: MeritLine, permission: 'compensation:merit:read' },

  // ── Licensing ─────────────────────────────────────────────────────────────
  { code: 'licensing-invoices', module: 'licensing', name: 'License Invoices', description: 'Billing invoices by period and status', entity: LicenseInvoice, permission: 'licensing:read' },
  { code: 'licensing-consumption', module: 'licensing', name: 'Consumption Records', description: 'Metered consumption by type, module and period', entity: ConsumptionRecord, permission: 'licensing:read' },
];

export const REPORT_BY_CODE = new Map(REPORT_CATALOG.map((r) => [r.code, r]));
