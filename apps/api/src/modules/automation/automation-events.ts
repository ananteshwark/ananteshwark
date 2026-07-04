/**
 * Catalog of automation trigger events. Every business workflow emits its
 * lifecycle events through AutomationService.emit(), so a tenant can attach
 * rules (notify / email / webhook) to any of them.
 */
export interface AutomationEventDef {
  event: string;
  label: string;
  module: string;
}

export const AUTOMATION_EVENTS: AutomationEventDef[] = [
  // Approval workflow engine
  { event: 'workflow.started', label: 'Approval workflow started', module: 'workflow' },
  { event: 'workflow.approved', label: 'Approval workflow fully approved', module: 'workflow' },
  { event: 'workflow.rejected', label: 'Approval workflow rejected', module: 'workflow' },

  // HR
  { event: 'employee.created', label: 'Employee created', module: 'hr' },
  { event: 'employee.terminated', label: 'Employee terminated/resigned', module: 'hr' },
  { event: 'leave.submitted', label: 'Leave application submitted', module: 'hr' },
  { event: 'leave.approved', label: 'Leave approved', module: 'hr' },
  { event: 'leave.rejected', label: 'Leave rejected', module: 'hr' },
  { event: 'exit.initiated', label: 'Employee exit initiated', module: 'hr' },
  { event: 'exit.fnf_approved', label: 'F&F settlement approved', module: 'hr' },

  // Expenses
  { event: 'expense.submitted', label: 'Expense claim submitted', module: 'expenses' },
  { event: 'expense.approved', label: 'Expense claim approved', module: 'expenses' },
  { event: 'expense.rejected', label: 'Expense claim rejected', module: 'expenses' },
  { event: 'expense.paid', label: 'Expense claim paid', module: 'expenses' },

  // Procurement
  { event: 'requisition.approved', label: 'Purchase requisition approved', module: 'procurement' },
  { event: 'po.approved', label: 'Purchase order approved', module: 'procurement' },
  { event: 'grn.confirmed', label: 'Goods receipt confirmed', module: 'procurement' },
  { event: 'vendor_invoice.blocked', label: 'Vendor invoice blocked (3-way match)', module: 'procurement' },
  { event: 'vendor_invoice.approved', label: 'Vendor invoice approved', module: 'procurement' },
  { event: 'vendor_invoice.paid', label: 'Vendor invoice fully paid', module: 'procurement' },

  // Sales
  { event: 'sales_order.confirmed', label: 'Sales order confirmed', module: 'sales' },
  { event: 'sales_order.shipped', label: 'Sales order shipped', module: 'sales' },
  { event: 'sales_order.completed', label: 'Sales order completed', module: 'sales' },

  // Payroll
  { event: 'payroll.run.completed', label: 'Payroll run processed', module: 'payroll' },

  // CRM / service
  { event: 'ticket.created', label: 'Service ticket created', module: 'crm' },
  { event: 'ticket.resolved', label: 'Service ticket resolved', module: 'crm' },
  { event: 'ticket.sla_breached', label: 'Service ticket SLA breached (scheduled sweep)', module: 'crm' },

  // Maintenance
  { event: 'maintenance.breakdown_reported', label: 'Equipment breakdown reported', module: 'maintenance' },

  // Finance (scheduled sweeps)
  { event: 'ar_invoice.overdue', label: 'AR invoice became overdue (scheduled sweep)', module: 'finance' },
  { event: 'dunning.sent', label: 'Dunning run sent', module: 'finance' },

  // Contracts (scheduled sweep)
  { event: 'contract.expiring', label: 'Contract expiring within 30 days (scheduled sweep)', module: 'contracts' },
];

export const AUTOMATION_EVENT_KEYS = new Set(AUTOMATION_EVENTS.map((e) => e.event));
