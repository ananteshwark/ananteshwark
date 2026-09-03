import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CipAsset, CipStatus } from './entities/cip-asset.entity';
import { FixedAsset, AssetStatus } from './entities/fixed-asset.entity';
import { AssetCategory } from './entities/asset-category.entity';
import { GlService } from '../gl/gl.service';
import { JournalSource } from '../gl/entities/journal-entry.entity';
import { Account } from '../gl/entities/account.entity';
import { DEFAULT_ACCOUNT_CODES } from '../finance.constants';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class FaLifecycleService {
  constructor(
    @InjectRepository(CipAsset) private readonly cipRepo: Repository<CipAsset>,
    @InjectRepository(FixedAsset) private readonly assetRepo: Repository<FixedAsset>,
    @InjectRepository(AssetCategory) private readonly categoryRepo: Repository<AssetCategory>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    private readonly glService: GlService,
  ) {}

  private async resolveAccount(tenantId: string, code: string): Promise<Account | null> {
    return this.accountRepo.findOne({ where: { tenantId, code } });
  }

  // ─── Ph-116: CIP assets ───────────────────────────────────────────

  async listCip(tenantId: string): Promise<CipAsset[]> {
    return this.cipRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async getCip(tenantId: string, id: string): Promise<CipAsset> {
    const cip = await this.cipRepo.findOne({ where: { id, tenantId } });
    if (!cip) throw new NotFoundException(`CIP asset ${id} not found`);
    return cip;
  }

  async createCip(tenantId: string, data: {
    cipCode: string; name: string; categoryId: string; startDate: string; cipGlAccountId?: string;
  }): Promise<CipAsset> {
    if (!data.cipCode) throw new BadRequestException('cipCode is required');
    const cip = this.cipRepo.create({
      tenantId,
      cipCode: data.cipCode,
      name: data.name,
      categoryId: data.categoryId,
      accumulatedCost: 0,
      status: CipStatus.IN_PROGRESS,
      costLines: [],
      startDate: data.startDate,
      cipGlAccountId: data.cipGlAccountId ?? null,
    } as any) as unknown as CipAsset;
    return (this.cipRepo.save(cip) as unknown) as Promise<CipAsset>;
  }

  async addCipCost(tenantId: string, id: string, data: {
    date: string; description: string; amount: number; sourceRef?: string;
  }): Promise<CipAsset> {
    const cip = await this.getCip(tenantId, id);
    if (cip.status !== CipStatus.IN_PROGRESS) {
      throw new BadRequestException('Costs can only be added to in-progress CIP assets');
    }
    if (!data.amount || data.amount <= 0) throw new BadRequestException('amount must be > 0');
    cip.costLines = [...(cip.costLines ?? []), {
      date: data.date, description: data.description, amount: round2(data.amount), sourceRef: data.sourceRef ?? null,
    }];
    cip.accumulatedCost = round2(Number(cip.accumulatedCost) + data.amount);
    return (this.cipRepo.save(cip) as unknown) as Promise<CipAsset>;
  }

  /**
   * Capitalize a CIP asset: create an in-service FixedAsset and post a JE
   * transferring CIP → Fixed Asset.
   */
  async capitalizeCip(tenantId: string, id: string, data: {
    capitalizedDate: string; usefulLifeMonths: number; depreciationMethod?: string;
    residualValue?: number; assetGlAccountId?: string;
  }, userId: string): Promise<{ cip: CipAsset; asset: FixedAsset }> {
    const cip = await this.getCip(tenantId, id);
    if (cip.status !== CipStatus.IN_PROGRESS) throw new BadRequestException('CIP asset already finalized');
    if (Number(cip.accumulatedCost) <= 0) throw new BadRequestException('Cannot capitalize a CIP asset with zero cost');

    const category = await this.categoryRepo.findOne({ where: { id: cip.categoryId, tenantId } });
    const cost = round2(Number(cip.accumulatedCost));

    const asset = (await this.assetRepo.save(
      this.assetRepo.create({
        tenantId,
        assetCode: `${cip.cipCode}-CAP`,
        name: cip.name,
        categoryId: cip.categoryId,
        acquisitionDate: data.capitalizedDate,
        acquisitionCost: cost,
        residualValue: data.residualValue ?? 0,
        usefulLifeMonths: data.usefulLifeMonths,
        depreciationMethod: (data.depreciationMethod ?? (category as any)?.depreciationMethod ?? 'STRAIGHT_LINE') as any,
        accumulatedDepreciation: 0,
        netBookValue: cost,
        glAccountId: data.assetGlAccountId ?? (category as any)?.assetGlAccountId ?? null,
        status: AssetStatus.ACTIVE,
      } as any),
    )) as unknown as FixedAsset;

    // JE: Dr Fixed Asset, Cr CIP
    const faAccount = data.assetGlAccountId
      ? await this.glService.findAccount(tenantId, data.assetGlAccountId)
      : await this.resolveAccount(tenantId, DEFAULT_ACCOUNT_CODES.FIXED_ASSETS);
    const cipAccount = cip.cipGlAccountId
      ? await this.glService.findAccount(tenantId, cip.cipGlAccountId)
      : await this.resolveAccount(tenantId, DEFAULT_ACCOUNT_CODES.CIP_ASSET);
    if (faAccount && cipAccount) {
      await this.glService.postJournalEntry(
        tenantId,
        {
          date: data.capitalizedDate,
          description: `Capitalize CIP ${cip.cipCode} → asset ${asset.assetCode}`,
          source: JournalSource.FIXED_ASSETS,
          currency: 'USD',
          lines: [
            { accountId: faAccount.id, debit: cost, credit: 0, description: 'Asset capitalization' },
            { accountId: cipAccount.id, debit: 0, credit: cost, description: 'CIP transfer' },
          ],
        },
        userId,
      );
    }

    cip.status = CipStatus.CAPITALIZED;
    cip.capitalizedDate = data.capitalizedDate;
    cip.assetId = asset.id;
    await this.cipRepo.save(cip);
    return { cip, asset };
  }

  // ─── Ph-119: Impairment (IAS 36) ──────────────────────────────────

  /**
   * Record an impairment when recoverable amount < carrying amount.
   * Posts Dr Impairment loss, Cr Accumulated impairment; reduces NBV.
   */
  async recordImpairment(tenantId: string, assetId: string, data: {
    date: string; recoverableAmount: number; reason?: string;
  }, userId: string): Promise<FixedAsset> {
    const asset = await this.assetRepo.findOne({ where: { id: assetId, tenantId } });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);
    if (asset.status !== AssetStatus.ACTIVE) throw new BadRequestException('Only active assets can be impaired');
    const carrying = round2(Number(asset.netBookValue));
    const recoverable = round2(data.recoverableAmount);
    if (recoverable >= carrying) {
      throw new BadRequestException(`Recoverable amount (${recoverable}) is not below carrying amount (${carrying}); no impairment`);
    }
    const loss = round2(carrying - recoverable);

    const lossAccount = await this.resolveAccount(tenantId, DEFAULT_ACCOUNT_CODES.IMPAIRMENT_LOSS);
    const accumAccount = await this.resolveAccount(tenantId, DEFAULT_ACCOUNT_CODES.ACCUM_IMPAIRMENT);
    if (lossAccount && accumAccount) {
      await this.glService.postJournalEntry(
        tenantId,
        {
          date: data.date,
          description: `Impairment of ${asset.assetCode}: ${data.reason ?? 'IAS 36'}`,
          source: JournalSource.FIXED_ASSETS,
          currency: 'USD',
          lines: [
            { accountId: lossAccount.id, debit: loss, credit: 0, description: 'Impairment loss' },
            { accountId: accumAccount.id, debit: 0, credit: loss, description: 'Accumulated impairment' },
          ],
        },
        userId,
      );
    }

    asset.accumulatedImpairment = round2(Number(asset.accumulatedImpairment) + loss);
    asset.netBookValue = recoverable;
    asset.lastImpairedDate = data.date;
    asset.status = AssetStatus.IMPAIRED;
    return (this.assetRepo.save(asset) as unknown) as Promise<FixedAsset>;
  }

  // ─── Ph-120: Revaluation (IAS 16) ─────────────────────────────────

  /**
   * Revalue an asset to fair value. Upward revaluation credits the revaluation
   * reserve (equity); downward reverses reserve then hits P&L.
   */
  async revalue(tenantId: string, assetId: string, data: {
    date: string; fairValue: number;
  }, userId: string): Promise<FixedAsset> {
    const asset = await this.assetRepo.findOne({ where: { id: assetId, tenantId } });
    if (!asset) throw new NotFoundException(`Asset ${assetId} not found`);
    if (![AssetStatus.ACTIVE, AssetStatus.IMPAIRED].includes(asset.status)) {
      throw new BadRequestException('Only active/impaired assets can be revalued');
    }
    const carrying = round2(Number(asset.netBookValue));
    const fairValue = round2(data.fairValue);
    const delta = round2(fairValue - carrying);
    if (delta === 0) throw new BadRequestException('Fair value equals carrying amount; nothing to revalue');

    const faAccount = asset.glAccountId
      ? await this.glService.findAccount(tenantId, asset.glAccountId)
      : await this.resolveAccount(tenantId, DEFAULT_ACCOUNT_CODES.FIXED_ASSETS);
    const reserveAccount = await this.resolveAccount(tenantId, DEFAULT_ACCOUNT_CODES.REVALUATION_RESERVE);
    const lossAccount = await this.resolveAccount(tenantId, DEFAULT_ACCOUNT_CODES.IMPAIRMENT_LOSS);

    if (faAccount && reserveAccount && lossAccount) {
      const lines: any[] = [];
      if (delta > 0) {
        // upward: Dr asset, Cr revaluation reserve
        lines.push({ accountId: faAccount.id, debit: delta, credit: 0, description: 'Revaluation increase' });
        lines.push({ accountId: reserveAccount.id, debit: 0, credit: delta, description: 'Revaluation reserve' });
      } else {
        const decrease = Math.abs(delta);
        const reserveBal = round2(Number(asset.revaluationReserve));
        const fromReserve = Math.min(decrease, reserveBal);
        const toPnl = round2(decrease - fromReserve);
        if (fromReserve > 0) lines.push({ accountId: reserveAccount.id, debit: fromReserve, credit: 0, description: 'Reverse revaluation reserve' });
        if (toPnl > 0) lines.push({ accountId: lossAccount.id, debit: toPnl, credit: 0, description: 'Revaluation loss to P&L' });
        lines.push({ accountId: faAccount.id, debit: 0, credit: decrease, description: 'Revaluation decrease' });
      }
      await this.glService.postJournalEntry(
        tenantId,
        {
          date: data.date,
          description: `Revaluation of ${asset.assetCode} to fair value ${fairValue}`,
          source: JournalSource.FIXED_ASSETS,
          currency: 'USD',
          lines,
        },
        userId,
      );
    }

    if (delta > 0) {
      asset.revaluationReserve = round2(Number(asset.revaluationReserve) + delta);
    } else {
      asset.revaluationReserve = round2(Math.max(0, Number(asset.revaluationReserve) - Math.abs(delta)));
    }
    asset.netBookValue = fairValue;
    asset.lastRevaluedDate = data.date;
    return (this.assetRepo.save(asset) as unknown) as Promise<FixedAsset>;
  }
}
