/**
 * Default picklist definitions seeded per tenant on first access, so every
 * module has an editable set of dropdown options out of the box. Admins can
 * add/edit/deactivate options and create new picklists on top of these.
 */
export interface PicklistDefault {
  module: string;
  key: string;
  label: string;
  description?: string;
  options: { value: string; label: string; color?: string }[];
}

const o = (...vals: string[]) => vals.map((v) => ({ value: v.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: v }));

export const PICKLIST_DEFAULTS: PicklistDefault[] = [
  // HR
  { module: 'hr', key: 'employmentType', label: 'Employment Type', options: o('Full-Time', 'Part-Time', 'Contract', 'Intern', 'Temporary') },
  { module: 'hr', key: 'maritalStatus', label: 'Marital Status', options: o('Single', 'Married', 'Divorced', 'Widowed') },
  { module: 'hr', key: 'gender', label: 'Gender', options: o('Male', 'Female', 'Other', 'Prefer Not To Say') },
  { module: 'hr', key: 'bloodGroup', label: 'Blood Group', options: [ 'A+','A-','B+','B-','O+','O-','AB+','AB-' ].map((v)=>({value:v,label:v})) },
  { module: 'hr', key: 'relationship', label: 'Dependent Relationship', options: o('Spouse', 'Child', 'Parent', 'Sibling', 'Other') },
  // Leave
  { module: 'hr', key: 'leaveType', label: 'Leave Type', options: o('Annual', 'Sick', 'Casual', 'Maternity', 'Paternity', 'Unpaid', 'Bereavement') },
  // Finance
  { module: 'finance', key: 'paymentTerms', label: 'Payment Terms', options: o('Net 15', 'Net 30', 'Net 45', 'Net 60', 'Due On Receipt') },
  { module: 'finance', key: 'currency', label: 'Currency', options: [ 'USD','EUR','GBP','INR','AED','JPY','CNY','AUD' ].map((v)=>({value:v,label:v})) },
  { module: 'finance', key: 'accountType', label: 'Account Type', options: o('Asset', 'Liability', 'Equity', 'Revenue', 'Expense') },
  { module: 'finance', key: 'taxCode', label: 'Tax Code', options: o('Standard', 'Reduced', 'Zero-Rated', 'Exempt') },
  // Payroll
  { module: 'payroll', key: 'payFrequency', label: 'Pay Frequency', options: o('Monthly', 'Bi-Weekly', 'Weekly', 'Semi-Monthly') },
  { module: 'payroll', key: 'componentType', label: 'Pay Component Type', options: o('Earning', 'Deduction', 'Employer Contribution', 'Reimbursement') },
  // Procurement
  { module: 'procurement', key: 'poStatus', label: 'Purchase Order Status', options: o('Draft', 'Pending Approval', 'Approved', 'Received', 'Closed', 'Cancelled') },
  { module: 'procurement', key: 'uom', label: 'Unit of Measure', options: o('Each', 'Box', 'Kilogram', 'Litre', 'Metre', 'Hour', 'Pack') },
  // Inventory
  { module: 'inventory', key: 'movementType', label: 'Stock Movement Type', options: o('Receipt', 'Issue', 'Transfer', 'Adjustment', 'Return') },
  { module: 'inventory', key: 'abcClass', label: 'ABC Classification', options: o('A', 'B', 'C') },
  // CRM
  { module: 'crm', key: 'leadSource', label: 'Lead Source', options: o('Website', 'Referral', 'Cold Call', 'Event', 'Advertisement', 'Partner') },
  { module: 'crm', key: 'opportunityStage', label: 'Opportunity Stage', options: o('Qualification', 'Needs Analysis', 'Proposal', 'Negotiation', 'Closed Won', 'Closed Lost') },
  { module: 'crm', key: 'priority', label: 'Priority', options: [ {value:'low',label:'Low',color:'#22c55e'},{value:'medium',label:'Medium',color:'#eab308'},{value:'high',label:'High',color:'#f97316'},{value:'urgent',label:'Urgent',color:'#ef4444'} ] },
  // Sales
  { module: 'sales', key: 'orderStatus', label: 'Sales Order Status', options: o('Draft', 'Confirmed', 'Picked', 'Shipped', 'Invoiced', 'Cancelled') },
  { module: 'sales', key: 'shippingMethod', label: 'Shipping Method', options: o('Standard', 'Express', 'Overnight', 'Pickup') },
  // Projects
  { module: 'projects', key: 'projectStatus', label: 'Project Status', options: o('Planning', 'Active', 'On Hold', 'Completed', 'Cancelled') },
  { module: 'projects', key: 'taskPriority', label: 'Task Priority', options: o('Low', 'Medium', 'High', 'Critical') },
  // Talent
  { module: 'talent', key: 'applicationStage', label: 'Application Stage', options: o('Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected') },
  { module: 'talent', key: 'performanceRating', label: 'Performance Rating', options: o('Exceeds', 'Meets', 'Below', 'Unsatisfactory') },
  // Expenses
  { module: 'expenses', key: 'expenseCategory', label: 'Expense Category', options: o('Travel', 'Meals', 'Accommodation', 'Office Supplies', 'Software', 'Other') },
  // Manufacturing
  { module: 'manufacturing', key: 'workOrderStatus', label: 'Work Order Status', options: o('Planned', 'Released', 'In Progress', 'Completed', 'Closed') },
  // Quality
  { module: 'quality', key: 'inspectionResult', label: 'Inspection Result', options: o('Pass', 'Fail', 'Conditional', 'Pending') },
  // Maintenance
  { module: 'maintenance', key: 'workRequestType', label: 'Work Request Type', options: o('Preventive', 'Corrective', 'Breakdown', 'Inspection') },
  // Contracts
  { module: 'contracts', key: 'contractStatus', label: 'Contract Status', options: o('Draft', 'Under Review', 'Active', 'Expired', 'Terminated') },
  // Generic / shared
  { module: 'general', key: 'country', label: 'Country', options: o('United States', 'United Kingdom', 'India', 'United Arab Emirates', 'Germany', 'Australia', 'Canada', 'Singapore') },
  { module: 'general', key: 'department', label: 'Department', options: o('Engineering', 'Sales', 'Marketing', 'Finance', 'Human Resources', 'Operations', 'IT', 'Legal') },
];
