export interface FieldDef {
  field: string;
  label: string;
  group: string;
  enabled: boolean;
  required: boolean;
}

export const FIELD_DEFAULTS: Record<string, FieldDef[]> = {
  'hr.employee': [
    { field: 'middleName',        label: 'Middle Name',         group: 'Identity',      enabled: true,  required: false },
    { field: 'phone',             label: 'Mobile Phone',        group: 'Identity',      enabled: true,  required: false },
    { field: 'probationEndDate',  label: 'Probation End Date',  group: 'Employment',    enabled: true,  required: false },
    { field: 'confirmationDate',  label: 'Confirmation Date',   group: 'Employment',    enabled: true,  required: false },
    { field: 'designationId',     label: 'Designation',         group: 'Employment',    enabled: true,  required: false },
    { field: 'managerId',         label: 'Reporting Manager',   group: 'Employment',    enabled: true,  required: false },
    { field: 'locationId',        label: 'Location',            group: 'Employment',    enabled: true,  required: false },
    { field: 'dateOfBirth',       label: 'Date of Birth',       group: 'Personal',      enabled: true,  required: false },
    { field: 'gender',            label: 'Gender',              group: 'Personal',      enabled: true,  required: false },
    { field: 'maritalStatus',     label: 'Marital Status',      group: 'Personal',      enabled: true,  required: false },
    { field: 'nationality',       label: 'Nationality',         group: 'Personal',      enabled: true,  required: false },
    { field: 'bloodGroup',        label: 'Blood Group',         group: 'Personal',      enabled: true,  required: false },
    { field: 'personalEmail',     label: 'Personal Email',      group: 'Personal',      enabled: true,  required: false },
    { field: 'homePhone',         label: 'Home Phone',          group: 'Personal',      enabled: true,  required: false },
    { field: 'pan',               label: 'PAN',                 group: 'Identity Docs', enabled: true,  required: false },
    { field: 'aadhar',            label: 'Aadhar',              group: 'Identity Docs', enabled: true,  required: false },
    { field: 'passportNumber',    label: 'Passport Number',     group: 'Identity Docs', enabled: true,  required: false },
    { field: 'passportExpiry',    label: 'Passport Expiry',     group: 'Identity Docs', enabled: true,  required: false },
    { field: 'currentAddress',    label: 'Current Address',     group: 'Address',       enabled: true,  required: false },
    { field: 'permanentAddress',  label: 'Permanent Address',   group: 'Address',       enabled: true,  required: false },
    { field: 'emergencyContact',  label: 'Emergency Contact',   group: 'Emergency',     enabled: true,  required: false },
    { field: 'bankDetails',       label: 'Bank Details',        group: 'Banking',       enabled: true,  required: false },
  ],
  'finance.bill': [
    { field: 'dueDate',       label: 'Due Date',        group: 'Bill',   enabled: true, required: false },
    { field: 'currency',      label: 'Currency',        group: 'Bill',   enabled: true, required: false },
    { field: 'notes',         label: 'Notes / Memo',    group: 'Bill',   enabled: true, required: false },
    { field: 'taxAmount',     label: 'Tax Amount',      group: 'Bill',   enabled: true, required: false },
    { field: 'reference',     label: 'Reference No.',   group: 'Bill',   enabled: true, required: false },
  ],
  'finance.invoice': [
    { field: 'dueDate',       label: 'Due Date',        group: 'Invoice', enabled: true, required: false },
    { field: 'currency',      label: 'Currency',        group: 'Invoice', enabled: true, required: false },
    { field: 'notes',         label: 'Notes / Memo',    group: 'Invoice', enabled: true, required: false },
    { field: 'taxAmount',     label: 'Tax Amount',      group: 'Invoice', enabled: true, required: false },
    { field: 'reference',     label: 'Reference No.',   group: 'Invoice', enabled: true, required: false },
    { field: 'paymentTerms',  label: 'Payment Terms',   group: 'Invoice', enabled: true, required: false },
  ],
  'procurement.po': [
    { field: 'deliveryDate',  label: 'Delivery Date',    group: 'PO', enabled: true, required: false },
    { field: 'deliveryAddr',  label: 'Delivery Address', group: 'PO', enabled: true, required: false },
    { field: 'paymentTerms',  label: 'Payment Terms',    group: 'PO', enabled: true, required: false },
    { field: 'notes',         label: 'Notes',            group: 'PO', enabled: true, required: false },
    { field: 'taxAmount',     label: 'Tax Amount',       group: 'PO', enabled: true, required: false },
  ],
  'procurement.requisition': [
    { field: 'priority',  label: 'Priority',        group: 'Requisition', enabled: true, required: false },
    { field: 'notes',     label: 'Notes',           group: 'Requisition', enabled: true, required: false },
    { field: 'neededBy',  label: 'Needed By Date',  group: 'Requisition', enabled: true, required: false },
  ],
  'talent.applicant': [
    { field: 'phone',          label: 'Phone',            group: 'Applicant', enabled: true, required: false },
    { field: 'linkedIn',       label: 'LinkedIn URL',     group: 'Applicant', enabled: true, required: false },
    { field: 'portfolio',      label: 'Portfolio URL',    group: 'Applicant', enabled: true, required: false },
    { field: 'expectedSalary', label: 'Expected Salary',  group: 'Applicant', enabled: true, required: false },
    { field: 'noticePeriod',   label: 'Notice Period',    group: 'Applicant', enabled: true, required: false },
    { field: 'source',         label: 'Source / Referral',group: 'Applicant', enabled: true, required: false },
  ],
  'payroll.component': [
    { field: 'description', label: 'Description',   group: 'Component', enabled: true, required: false },
    { field: 'taxable',     label: 'Taxable Flag',  group: 'Component', enabled: true, required: false },
    { field: 'pf',          label: 'PF Applicable', group: 'Component', enabled: true, required: false },
    { field: 'esi',         label: 'ESI Applicable',group: 'Component', enabled: true, required: false },
  ],
  'expenses.claim': [
    { field: 'receiptNumber', label: 'Receipt Number', group: 'Expense', enabled: true, required: false },
    { field: 'notes',         label: 'Notes',          group: 'Expense', enabled: true, required: false },
    { field: 'projectId',     label: 'Project',        group: 'Expense', enabled: true, required: false },
    { field: 'billable',      label: 'Billable',       group: 'Expense', enabled: true, required: false },
  ],
  'crm.lead': [
    { field: 'phone',          label: 'Phone',          group: 'Lead', enabled: true, required: false },
    { field: 'source',         label: 'Lead Source',    group: 'Lead', enabled: true, required: false },
    { field: 'expectedValue',  label: 'Expected Value', group: 'Lead', enabled: true, required: false },
    { field: 'expectedClose',  label: 'Expected Close', group: 'Lead', enabled: true, required: false },
    { field: 'notes',          label: 'Notes',          group: 'Lead', enabled: true, required: false },
  ],
};
