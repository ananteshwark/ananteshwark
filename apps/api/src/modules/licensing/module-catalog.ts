/**
 * Server-side catalog of licensable modules. This is the single source of
 * truth for what a `moduleKey` on a ModuleLicense / EmployeeModuleAssignment
 * may be, and it maps each module to the API route prefixes it governs so the
 * enforcement layer can decide which module a request belongs to.
 *
 * `core: true` marks modules that are always available (the licensing console
 * itself must stay reachable even when a tenant is blocked).
 */

export interface LicensableModule {
  key: string;
  name: string;
  description: string;
  /** First URL path segments governed by this module. */
  routePrefixes: string[];
  /** Core modules are always available and never license-enforced. */
  core?: boolean;
}

export const MODULE_CATALOG: LicensableModule[] = [
  { key: 'hr', name: 'Core HR', description: 'Employee lifecycle, leave, attendance, exits, journeys, letters', routePrefixes: ['hr', 'letters'] },
  { key: 'talent', name: 'Talent', description: 'Recruiting, onboarding, performance, succession, background checks', routePrefixes: ['talent', 'recruiting', 'bgv'] },
  { key: 'payroll', name: 'Payroll', description: 'Payroll runs, statutory filings, payroll costing', routePrefixes: ['payroll'] },
  { key: 'benefits', name: 'Benefits', description: 'Benefits plans, enrolment, compensation workbench', routePrefixes: ['benefits'] },
  { key: 'compensation', name: 'Compensation', description: 'Merit planning and compensation modelling', routePrefixes: ['compensation'] },
  { key: 'finance', name: 'Finance', description: 'GL, AR/AP, treasury, budgeting, close, consolidation', routePrefixes: ['finance'] },
  { key: 'expenses', name: 'Expenses & Travel', description: 'Expense claims, travel requests, card feeds', routePrefixes: ['expenses', 'travel'] },
  { key: 'procurement', name: 'Procurement', description: 'Requisitions to vendor invoices, sourcing, vendor portal', routePrefixes: ['procurement', 'vendor-portal'] },
  { key: 'inventory', name: 'Inventory & Supply Chain', description: 'Stock, warehousing, logistics, demand planning', routePrefixes: ['inventory', 'logistics', 'planning'] },
  { key: 'manufacturing', name: 'Manufacturing', description: 'Work orders, BOMs, process manufacturing', routePrefixes: ['manufacturing'] },
  { key: 'quality', name: 'Quality', description: 'Inspections, non-conformances, CAPA', routePrefixes: ['quality'] },
  { key: 'maintenance', name: 'Maintenance', description: 'Assets, work orders, CMMS', routePrefixes: ['maintenance'] },
  { key: 'crm', name: 'CRM & Marketing', description: 'Accounts, opportunities, service desk, campaigns', routePrefixes: ['crm', 'marketing'] },
  { key: 'sales', name: 'Sales', description: 'Orders, CPQ, fulfilment, billing plans, incentives', routePrefixes: ['sales'] },
  { key: 'contracts', name: 'Contracts', description: 'Contract lifecycle management', routePrefixes: ['contracts'] },
  { key: 'projects', name: 'Projects', description: 'Project planning, billing, resources, EVM', routePrefixes: ['projects'] },
  { key: 'helpdesk', name: 'HR Helpdesk', description: 'Tickets, SLAs, knowledge-linked case management', routePrefixes: ['helpdesk'] },
  { key: 'engagement', name: 'Engagement', description: 'Surveys, recognition, social feed, action planning', routePrefixes: ['engagement', 'action-planning'] },
  { key: 'knowledge', name: 'Knowledge Base', description: 'Articles, categories, publishing workflow', routePrefixes: ['knowledge'] },
  { key: 'learning', name: 'Learning', description: 'Courses, academy certifications, external learning ecosystem', routePrefixes: ['learning'] },
  { key: 'compliance', name: 'Compliance & GRC', description: 'GST/PEPPOL, governance-risk-controls, privacy/DSAR', routePrefixes: ['compliance', 'grc', 'privacy'] },
  { key: 'collaboration', name: 'External Collaboration', description: 'Scoped portals for recruiters, vendors and agents', routePrefixes: ['collaboration'] },
  { key: 'analytics', name: 'Analytics', description: 'People analytics, BI, semantic layer, predictive models', routePrefixes: ['analytics'] },
  { key: 'ai', name: 'AI Suite', description: 'Copilot, OCR/CV parsing, insights, anomaly detection', routePrefixes: ['ai', 'assistant'] },
  { key: 'platform', name: 'Platform & Studio', description: 'Forms, webhooks, integrations, Studio, workflow engine, devices', routePrefixes: ['platform', 'studio', 'workflow', 'workflows', 'integration'] },
  { key: 'licensing', name: 'Licensing', description: 'License contracts, usage and billing (always available)', routePrefixes: [], core: true },
];

/** Route prefixes that are infrastructure, not licensable business modules. */
export const CORE_PREFIXES = new Set<string>([
  'auth', 'users', 'tenants', 'tenant', 'rbac', 'admin', 'security', 'settings',
  'search', 'email', 'notifications', 'delegations', 'attachments', 'automation',
  'audit', 'localization', 'health', 'metrics', 'mobile', 'sync', 'licensing',
]);

export const MODULE_KEYS = new Set(MODULE_CATALOG.map((m) => m.key));

export const PREFIX_TO_MODULE: Record<string, string> = Object.fromEntries(
  MODULE_CATALOG.filter((m) => !m.core).flatMap((m) => m.routePrefixes.map((p) => [p, m.key])),
);

/** First non-empty path segment of a request URL (query string stripped). */
export function pathPrefix(path: string): string | null {
  const clean = (path ?? '').split('?')[0];
  const seg = clean.split('/').find((s) => s.length > 0);
  return seg ? seg.toLowerCase() : null;
}

/** The licensable module governing a request path, or null when unmapped. */
export function moduleKeyForPath(path: string): string | null {
  const prefix = pathPrefix(path);
  return prefix ? PREFIX_TO_MODULE[prefix] ?? null : null;
}
