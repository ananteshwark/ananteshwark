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
  { event: 'leave.encashed', label: 'Leave encashment approved', module: 'hr' },
  { event: 'exit.initiated', label: 'Employee exit initiated', module: 'hr' },
  { event: 'exit.fnf_approved', label: 'F&F settlement approved', module: 'hr' },

  // Expenses
  { event: 'expense.submitted', label: 'Expense claim submitted', module: 'expenses' },
  { event: 'expense.approved', label: 'Expense claim approved', module: 'expenses' },
  { event: 'expense.rejected', label: 'Expense claim rejected', module: 'expenses' },
  { event: 'expense.paid', label: 'Expense claim paid', module: 'expenses' },
  { event: 'expense.budget_alert', label: 'Expense budget threshold crossed', module: 'expenses' },

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

  // Engagement (surveys, recognition, company feed)
  { event: 'survey.published', label: 'Survey published', module: 'hr' },
  { event: 'survey.closed', label: 'Survey closed', module: 'hr' },
  { event: 'recognition.given', label: 'Recognition given', module: 'hr' },
  { event: 'feed.announcement_posted', label: 'Company announcement posted', module: 'hr' },

  // HR helpdesk
  { event: 'hr_case.created', label: 'HR helpdesk case created', module: 'hr' },
  { event: 'hr_case.resolved', label: 'HR helpdesk case resolved', module: 'hr' },
  { event: 'hr_case.sla_escalated', label: 'HR helpdesk case escalated (SLA breach)', module: 'hr' },

  // Travel
  { event: 'travel.submitted', label: 'Travel request submitted', module: 'expenses' },
  { event: 'travel.approved', label: 'Travel request approved', module: 'expenses' },
  { event: 'travel.rejected', label: 'Travel request rejected', module: 'expenses' },

  // HR letters
  { event: 'letter.issued', label: 'HR letter issued', module: 'hr' },

  // Background verification
  { event: 'bgv.completed', label: 'Background verification completed', module: 'talent' },

  // Workforce rostering
  { event: 'roster.published', label: 'Shift roster published', module: 'hr' },

  // AI anomaly layer
  { event: 'anomaly.detected', label: 'AI anomaly scan found issues', module: 'analytics' },
];

export const AUTOMATION_EVENT_KEYS = new Set(AUTOMATION_EVENTS.map((e) => e.event));
