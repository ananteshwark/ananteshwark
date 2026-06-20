import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssetCategory, DepreciationMethod } from './entities/asset-category.entity';
import { FixedAsset, AssetStatus } from './entities/fixed-asset.entity';
import { DepreciationRun, DepreciationRunLine, DepreciationRunStatus } from './entities/depreciation-run.entity';
import {
  CreateAssetCategoryDto, UpdateAssetCategoryDto,
  CreateFixedAssetDto, UpdateFixedAssetDto,
  DisposeAssetDto, RunDepreciationDto,
} from './dto/fixed-assets.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';
import { GlService, PostJournalEntryInput } from '../gl/gl.service';
import { JournalSource } from '../gl/entities/journal-entry.entity';

@Injectable()
export class FixedAssetsService {
  constructor(
    @InjectRepository(AssetCategory)
    private readonly categoryRepo: Repository<AssetCategory>,
    @InjectRepository(FixedAsset)
    private readonly assetRepo: Repository<FixedAsset>,
    @InjectRepository(DepreciationRun)
    private readonly runRepo: Repository<DepreciationRun>,
    @InjectRepository(DepreciationRunLine)
    private readonly runLineRepo: Repository<DepreciationRunLine>,
    private readonly glService: GlService,
  ) {}

  // ---- Asset Categories ----
  async createCategory(tenantId: string, dto: CreateAssetCategoryDto): Promise<AssetCategory> {
    const existing = await this.categoryRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Category code ${dto.code} already exists`);
    const cat = this.categoryRepo.create({ ...dto, tenantId });
    return this.categoryRepo.save(cat);
  }

  async listCategories(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<AssetCategory>> {
    const { page = 1, limit = 50 } = pagination;
    const [items, total] = await this.categoryRepo.findAndCount({
      where: { tenantId }, skip: (page - 1) * limit, take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateCategory(tenantId: string, id: string, dto: UpdateAssetCategoryDto): Promise<AssetCategory> {
    const cat = await this.categoryRepo.findOne({ where: { tenantId, id } });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    Object.assign(cat, dto);
    return this.categoryRepo.save(cat);
  }

  // ---- Fixed Assets ----
  async createAsset(tenantId: string, dto: CreateFixedAssetDto): Promise<FixedAsset> {
    const existing = await this.assetRepo.findOne({ where: { tenantId, assetCode: dto.assetCode } });
    if (existing) throw new ConflictException(`Asset code ${dto.assetCode} already exists`);
    const asset = this.assetRepo.create({
      ...dto,
      tenantId,
      accumulatedDepreciation: 0,
      netBookValue: dto.acquisitionCost,
      residualValue: dto.residualValue ?? 0,
      status: AssetStatus.ACTIVE,
    });
    return this.assetRepo.save(asset);
  }

  async listAssets(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { status?: string; categoryId?: string; search?: string },
  ): Promise<PaginatedResponseDto<FixedAsset>> {
    const { page = 1, limit = 20, sortBy = 'assetCode', sortOrder = 'ASC' } = pagination;
    const qb = this.assetRepo.createQueryBuilder('a').where('a.tenantId = :tenantId', { tenantId });
    if (filters?.status) qb.andWhere('a.status = :status', { status: filters.status });
    if (filters?.categoryId) qb.andWhere('a.categoryId = :catId', { catId: filters.categoryId });
    if (filters?.search) {
      qb.andWhere('(a.assetCode ILIKE :s OR a.name ILIKE :s)', { s: `%${filters.search}%` });
    }
    const validSort = ['assetCode', 'name', 'acquisitionDate', 'netBookValue', 'createdAt'];
    const orderField = validSort.includes(sortBy) ? sortBy : 'assetCode';
    qb.orderBy(`a.${orderField}`, sortOrder as 'ASC' | 'DESC')
      .skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findAsset(tenantId: string, id: string): Promise<FixedAsset> {
    const asset = await this.assetRepo.findOne({ where: { tenantId, id } });
    if (!asset) throw new NotFoundException(`Asset ${id} not found`);
    return asset;
  }

  async updateAsset(tenantId: string, id: string, dto: UpdateFixedAssetDto): Promise<FixedAsset> {
    const asset = await this.findAsset(tenantId, id);
    if (asset.status !== AssetStatus.ACTIVE) {
      throw new BadRequestException('Only active assets can be updated');
    }
    Object.assign(asset, dto);
    return this.assetRepo.save(asset);
  }

  async disposeAsset(tenantId: string, id: string, dto: DisposeAssetDto, userId: string): Promise<FixedAsset> {
    const asset = await this.findAsset(tenantId, id);
    if (asset.status !== AssetStatus.ACTIVE) {
      throw new BadRequestException('Only active assets can be disposed');
    }

    const gainLoss = dto.disposalAmount - asset.netBookValue;

    if (asset.glAccountId && asset.accumulatedDepGlAccountId && asset.depreciationGlAccountId) {
      try {
        const lines: PostJournalEntryInput['lines'] = [];
        // Debit: Accumulated Depreciation (removes contra asset)
        if (asset.accumulatedDepreciation > 0) {
          lines.push({
            accountId: asset.accumulatedDepGlAccountId,
            debit: asset.accumulatedDepreciation,
            credit: 0,
            description: `Disposal of ${asset.assetCode} - accumulated depreciation`,
          });
        }
        // Debit: Cash/Proceeds (disposal amount received)
        // Credit: Fixed Asset at cost
        lines.push({
          accountId: asset.glAccountId,
          debit: 0,
          credit: asset.acquisitionCost,
          description: `Disposal of ${asset.assetCode} - asset cost`,
        });
        // Gain or Loss account (best-effort: search for 'gain on disposal' or 'loss on disposal')
        if (gainLoss !== 0) {
          const gainLossAccounts = await this.glService.findAccounts(
            tenantId, { page: 1, limit: 1 } as any,
            { search: gainLoss > 0 ? 'gain on disposal' : 'loss on disposal' },
          );
          if (gainLossAccounts.items.length > 0) {
            lines.push({
              accountId: gainLossAccounts.items[0].id,
              debit: gainLoss < 0 ? Math.abs(gainLoss) : 0,
              credit: gainLoss > 0 ? gainLoss : 0,
              description: `Disposal of ${asset.assetCode} - ${gainLoss > 0 ? 'gain' : 'loss'}`,
            });
          }
        }
        // Debit: Proceeds received (offset to make it balance)
        if (dto.disposalAmount > 0) {
          const cashAccounts = await this.glService.findAccounts(
            tenantId, { page: 1, limit: 1 } as any, { search: 'cash' },
          );
          if (cashAccounts.items.length > 0) {
            lines.push({
              accountId: cashAccounts.items[0].id,
              debit: dto.disposalAmount,
              credit: 0,
              description: `Disposal proceeds for ${asset.assetCode}`,
            });
          }
        }

        const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
        const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
        if (Math.abs(totalDebit - totalCredit) < 0.01) {
          await this.glService.postJournalEntry(
            tenantId,
            {
              date: dto.disposalDate,
              description: `Asset disposal: ${asset.assetCode} - ${asset.name}`,
              source: JournalSource.FIXED_ASSETS,
              currency: 'USD',
              lines,
            },
            userId,
          );
        }
      } catch (_) {
        // GL posting is best-effort; disposal still proceeds
      }
    }

    asset.status = AssetStatus.DISPOSED;
    asset.disposalDate = dto.disposalDate;
    asset.disposalAmount = dto.disposalAmount;
    asset.disposalReason = dto.disposalReason ?? null;
    return this.assetRepo.save(asset);
  }

  // ---- Depreciation ----

  private computeMonthlyDepreciation(asset: FixedAsset): number {
    const depreciableAmount = asset.acquisitionCost - asset.residualValue;
    if (depreciableAmount <= 0 || asset.netBookValue <= asset.residualValue) return 0;

    switch (asset.depreciationMethod) {
      case DepreciationMethod.SLM: {
        const monthly = depreciableAmount / asset.usefulLifeMonths;
        const remaining = asset.netBookValue - asset.residualValue;
        return Math.min(monthly, remaining);
      }
      case DepreciationMethod.WDV: {
        const rate = 1 - Math.pow(asset.residualValue / asset.acquisitionCost, 1 / (asset.usefulLifeMonths / 12));
        const annual = asset.netBookValue * rate;
        const remaining = asset.netBookValue - asset.residualValue;
        return Math.min(annual / 12, remaining);
      }
      case DepreciationMethod.DB: {
        const rate = (2 / asset.usefulLifeMonths) * 12;
        const annual = asset.netBookValue * rate;
        const remaining = asset.netBookValue - asset.residualValue;
        return Math.min(annual / 12, remaining);
      }
      default:
        return 0;
    }
  }

  async runDepreciation(tenantId: string, dto: RunDepreciationDto, userId: string): Promise<DepreciationRun> {
    // Prevent duplicate runs for same period
    const existing = await this.runRepo.findOne({
      where: { tenantId, periodYear: dto.periodYear, periodMonth: dto.periodMonth },
    });
    if (existing) {
      throw new ConflictException(`Depreciation already run for ${dto.periodYear}-${dto.periodMonth}`);
    }

    const assets = await this.assetRepo.find({ where: { tenantId, status: AssetStatus.ACTIVE } });

    const run = await this.runRepo.save(
      this.runRepo.create({
        tenantId,
        periodYear: dto.periodYear,
        periodMonth: dto.periodMonth,
        runDate: new Date().toISOString().slice(0, 10),
        notes: dto.notes,
        status: DepreciationRunStatus.DRAFT,
        assetCount: 0,
        totalDepreciation: 0,
      }),
    );

    let total = 0;
    const lines: DepreciationRunLine[] = [];

    for (const asset of assets) {
      const dep = Math.round(this.computeMonthlyDepreciation(asset) * 100) / 100;
      if (dep <= 0) continue;
      lines.push(
        this.runLineRepo.create({
          tenantId,
          runId: run.id,
          assetId: asset.id,
          assetCode: asset.assetCode,
          assetName: asset.name,
          openingNbv: asset.netBookValue,
          depreciationAmount: dep,
          closingNbv: Math.round((asset.netBookValue - dep) * 100) / 100,
        }),
      );
      total += dep;
    }

    await this.runLineRepo.save(lines);

    // Update assets
    for (const line of lines) {
      const asset = assets.find(a => a.id === line.assetId)!;
      asset.accumulatedDepreciation = Math.round((asset.accumulatedDepreciation + line.depreciationAmount) * 100) / 100;
      asset.netBookValue = line.closingNbv;
    }
    await this.assetRepo.save(assets.filter(a => lines.some(l => l.assetId === a.id)));

    run.totalDepreciation = Math.round(total * 100) / 100;
    run.assetCount = lines.length;
    return this.runRepo.save(run);
  }

  async postDepreciationRun(tenantId: string, runId: string, userId: string): Promise<DepreciationRun> {
    const run = await this.runRepo.findOne({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException(`Depreciation run ${runId} not found`);
    if (run.status !== DepreciationRunStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT runs can be posted');
    }

    const runLines = await this.runLineRepo.find({ where: { runId, tenantId } });
    if (runLines.length === 0) {
      throw new BadRequestException('No depreciation lines to post');
    }

    // Best-effort GL posting: find depreciation expense and accumulated depreciation accounts
    try {
      const depExpAccounts = await this.glService.findAccounts(
        tenantId, { page: 1, limit: 1 } as any, { search: 'depreciation expense' },
      );
      const accumDepAccounts = await this.glService.findAccounts(
        tenantId, { page: 1, limit: 1 } as any, { search: 'accumulated depreciation' },
      );

      if (depExpAccounts.items.length > 0 && accumDepAccounts.items.length > 0) {
        const glLines = [
          {
            accountId: depExpAccounts.items[0].id,
            debit: run.totalDepreciation,
            credit: 0,
            description: `Depreciation expense ${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`,
          },
          {
            accountId: accumDepAccounts.items[0].id,
            debit: 0,
            credit: run.totalDepreciation,
            description: `Accumulated depreciation ${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`,
          },
        ];

        const je = await this.glService.postJournalEntry(
          tenantId,
          {
            date: run.runDate,
            description: `Depreciation run ${run.periodYear}-${String(run.periodMonth).padStart(2, '0')}`,
            source: JournalSource.FIXED_ASSETS,
            currency: 'USD',
            lines: glLines,
          },
          userId,
        );
        run.journalEntryId = je.id;
      }
    } catch (_) {
      // GL posting is best-effort
    }

    run.status = DepreciationRunStatus.POSTED;
    return this.runRepo.save(run);
  }

  async listDepreciationRuns(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<DepreciationRun>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.runRepo.findAndCount({
      where: { tenantId },
      order: { periodYear: 'DESC', periodMonth: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getDepreciationRunLines(tenantId: string, runId: string): Promise<DepreciationRunLine[]> {
    const run = await this.runRepo.findOne({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    return this.runLineRepo.find({ where: { runId, tenantId } });
  }

  async getAssetSchedule(tenantId: string, assetId: string): Promise<any[]> {
    const asset = await this.findAsset(tenantId, assetId);
    const schedule: any[] = [];
    let nbv = asset.acquisitionCost;
    const months = asset.usefulLifeMonths;
    const startDate = new Date(asset.acquisitionDate);

    for (let i = 0; i < months && nbv > asset.residualValue; i++) {
      const month = new Date(startDate);
      month.setMonth(month.getMonth() + i);
      const temp = { ...asset, netBookValue: nbv } as FixedAsset;
      const dep = Math.round(this.computeMonthlyDepreciation(temp) * 100) / 100;
      if (dep <= 0) break;
      nbv = Math.round((nbv - dep) * 100) / 100;
      schedule.push({
        period: `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`,
        depreciationAmount: dep,
        closingNbv: nbv,
      });
    }
    return schedule;
  }
}
