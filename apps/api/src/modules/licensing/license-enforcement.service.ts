import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LicenseContract, ContractStatus } from './entities/license-contract.entity';
import { ModuleLicense } from './entities/module-license.entity';
import { CORE_PREFIXES, PREFIX_TO_MODULE, pathPrefix } from './module-catalog';

export interface EnforcementDecision {
  allowed: boolean;
  /** Populated on a block. */
  reason?: string;
  /** Populated when access is allowed but degraded (grace period, trial). */
  warning?: string;
}

interface TenantLicenseState {
  expiresAt: number;
  contracts: LicenseContract[];
  /** Active module-license keys; null when no module licenses are configured. */
  licensedModules: Set<string> | null;
}

/**
 * Request-path license enforcement. Opt-in by configuration:
 *  - a tenant with no license contracts at all is never blocked (licensing
 *    simply isn't set up for that deployment);
 *  - once a contract exists, validity is enforced — an ACTIVE in-date contract
 *    passes, an expired one passes with a warning until its grace period ends,
 *    a TRIAL passes with a warning, anything else hard-blocks;
 *  - once at least one module license is configured, the modules a request
 *    touches must be covered (soft entitlement becomes real).
 * Core/infrastructure prefixes are always exempt. State is cached per tenant
 * for a minute; licensing mutations invalidate the cache explicitly.
 */
@Injectable()
export class LicenseEnforcementService {
  static readonly CACHE_TTL_MS = 60_000;
  private readonly cache = new Map<string, TenantLicenseState>();

  constructor(
    @InjectRepository(LicenseContract)
    private readonly contractRepo: Repository<LicenseContract>,
    @InjectRepository(ModuleLicense)
    private readonly moduleLicenseRepo: Repository<ModuleLicense>,
  ) {}

  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  private async state(tenantId: string): Promise<TenantLicenseState> {
    const hit = this.cache.get(tenantId);
    if (hit && hit.expiresAt > Date.now()) return hit;
    const contracts = await this.contractRepo.find({ where: { tenantId } });
    const modules = await this.moduleLicenseRepo.find({ where: { tenantId, isActive: true } });
    const state: TenantLicenseState = {
      expiresAt: Date.now() + LicenseEnforcementService.CACHE_TTL_MS,
      contracts,
      licensedModules: modules.length > 0 ? new Set(modules.map((m) => m.moduleKey)) : null,
    };
    this.cache.set(tenantId, state);
    return state;
  }

  private static graceEnd(contract: LicenseContract): string {
    const d = new Date(`${contract.contractEndDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (contract.gracePeriodDays ?? 0));
    return d.toISOString().slice(0, 10);
  }

  async checkRequest(tenantId: string, path: string, asOf: Date = new Date()): Promise<EnforcementDecision> {
    const prefix = pathPrefix(path);
    if (!prefix || CORE_PREFIXES.has(prefix)) return { allowed: true };

    const state = await this.state(tenantId);
    if (state.contracts.length === 0) return { allowed: true }; // licensing not configured

    const today = asOf.toISOString().slice(0, 10);
    const active = state.contracts.filter((c) => c.status === ContractStatus.ACTIVE);
    let warning: string | undefined;

    if (!active.some((c) => c.contractEndDate >= today)) {
      const inGrace = active.find((c) => LicenseEnforcementService.graceEnd(c) >= today);
      if (inGrace) {
        warning = `License contract expired — in grace period until ${LicenseEnforcementService.graceEnd(inGrace)}`;
      } else if (state.contracts.some((c) => c.status === ContractStatus.TRIAL)) {
        warning = 'Operating on a trial license contract';
      } else {
        return { allowed: false, reason: 'No active license contract for this tenant' };
      }
    }

    const moduleKey = PREFIX_TO_MODULE[prefix];
    if (moduleKey && state.licensedModules && !state.licensedModules.has(moduleKey)) {
      return { allowed: false, reason: `Module '${moduleKey}' is not licensed for this tenant` };
    }

    return { allowed: true, warning };
  }
}
