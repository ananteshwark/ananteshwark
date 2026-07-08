/**
 * Code-defined semantic layer: every queryable dataset whitelists its table,
 * dimensions, measures, and date column. All SQL identifiers come from this
 * registry — never from user input — so ad-hoc queries carry no injection
 * surface; user-supplied values only ever bind as parameters.
 */

export interface DatasetDimension {
  key: string;      // API name
  column: string;   // SQL column
  label: string;
}

export interface DatasetMeasure {
  key: string;
  label: string;
  sql: string;      // aggregate expression over whitelisted columns
}

export interface DatasetDef {
  key: string;
  label: string;
  table: string;
  dateColumn: string | null;
  dimensions: DatasetDimension[];
  measures: DatasetMeasure[];
}

export const DATASETS: DatasetDef[] = [
  {
    key: 'expenses',
    label: 'Expense claims',
    table: 'exp_claims',
    dateColumn: 'claim_date',
    dimensions: [
      { key: 'status', column: 'status', label: 'Status' },
      { key: 'currency', column: 'currency', label: 'Currency' },
      { key: 'employeeId', column: 'employee_id', label: 'Employee' },
    ],
    measures: [
      { key: 'count', label: 'Claims', sql: 'COUNT(*)' },
      { key: 'totalAmount', label: 'Total amount', sql: 'COALESCE(SUM(total_amount), 0)' },
      { key: 'avgAmount', label: 'Average amount', sql: 'COALESCE(AVG(total_amount), 0)' },
    ],
  },
  {
    key: 'sales_orders',
    label: 'Sales orders',
    table: 'so_sales_orders',
    dateColumn: 'order_date',
    dimensions: [
      { key: 'status', column: 'status', label: 'Status' },
      { key: 'currency', column: 'currency', label: 'Currency' },
    ],
    measures: [
      { key: 'count', label: 'Orders', sql: 'COUNT(*)' },
      { key: 'total', label: 'Order value', sql: 'COALESCE(SUM(total), 0)' },
    ],
  },
  {
    key: 'ar_invoices',
    label: 'AR invoices',
    table: 'fin_invoices',
    dateColumn: 'invoice_date',
    dimensions: [
      { key: 'status', column: 'status', label: 'Status' },
      { key: 'customerId', column: 'customer_id', label: 'Customer' },
    ],
    measures: [
      { key: 'count', label: 'Invoices', sql: 'COUNT(*)' },
      { key: 'total', label: 'Invoiced', sql: 'COALESCE(SUM(total), 0)' },
      { key: 'balanceDue', label: 'Outstanding', sql: 'COALESCE(SUM(balance_due), 0)' },
    ],
  },
  {
    key: 'purchase_orders',
    label: 'Purchase orders',
    table: 'proc_purchase_orders',
    dateColumn: 'po_date',
    dimensions: [
      { key: 'status', column: 'status', label: 'Status' },
      { key: 'vendorName', column: 'vendor_name', label: 'Vendor' },
    ],
    measures: [
      { key: 'count', label: 'POs', sql: 'COUNT(*)' },
      { key: 'total', label: 'PO value', sql: 'COALESCE(SUM(total), 0)' },
    ],
  },
  {
    key: 'employees',
    label: 'Employees',
    table: 'hr_employees',
    dateColumn: 'date_of_joining',
    dimensions: [
      { key: 'status', column: 'status', label: 'Status' },
      { key: 'departmentId', column: 'department_id', label: 'Department' },
      { key: 'payrollCountry', column: 'payroll_country', label: 'Payroll country' },
    ],
    measures: [
      { key: 'count', label: 'Headcount', sql: 'COUNT(*)' },
    ],
  },
  {
    key: 'tickets',
    label: 'Service tickets',
    table: 'crm_service_tickets',
    dateColumn: null,
    dimensions: [
      { key: 'status', column: 'status', label: 'Status' },
      { key: 'priority', column: 'priority', label: 'Priority' },
    ],
    measures: [
      { key: 'count', label: 'Tickets', sql: 'COUNT(*)' },
    ],
  },
];

export const DATASET_MAP = new Map(DATASETS.map((d) => [d.key, d]));
