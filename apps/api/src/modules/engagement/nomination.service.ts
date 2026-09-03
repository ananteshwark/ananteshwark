import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RecognitionProgram, RecognitionNomination,
  NominationProgramStatus, NominationStatus,
} from './entities/recognition-nomination.entity';
import { RecognitionBadge } from './entities/recognition.entity';

/**
 * Nomination-based recognition: award programs with panel voting. When a
 * nomination reaches the program's vote threshold (or an admin decides), it
 * is approved and — if the program has a badge — a wall recognition is
 * created through the existing RecognitionService.
 */
@Injectable()
export class NominationService {
  constructor(
    @InjectRepository(RecognitionProgram) private readonly programRepo: Repository<RecognitionProgram>,
    @InjectRepository(RecognitionNomination) private readonly nominationRepo: Repository<RecognitionNomination>,
    @InjectRepository(RecognitionBadge) private readonly badgeRepo: Repository<RecognitionBadge>,
  ) {}

  async createProgram(tenantId: string, dto: Partial<RecognitionProgram>): Promise<RecognitionProgram> {
    if (!dto.name?.trim()) throw new BadRequestException('Program name is required');
    if (dto.votesToWin != null && Number(dto.votesToWin) < 0) throw new BadRequestException('votesToWin cannot be negative');
    return this.programRepo.save(this.programRepo.create({ ...dto, tenantId, status: NominationProgramStatus.OPEN }));
  }

  async listPrograms(tenantId: string, status?: NominationProgramStatus): Promise<RecognitionProgram[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.programRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async closeProgram(tenantId: string, id: string): Promise<RecognitionProgram> {
    const program = await this.programRepo.findOne({ where: { id, tenantId } });
    if (!program) throw new NotFoundException(`Program ${id} not found`);
    program.status = NominationProgramStatus.CLOSED;
    return this.programRepo.save(program);
  }

  async nominate(
    tenantId: string, nominatedBy: { userId: string; name: string },
    dto: { programId: string; nomineeEmployeeId: string; nomineeName: string; justification: string },
  ): Promise<RecognitionNomination> {
    const program = await this.programRepo.findOne({ where: { id: dto.programId, tenantId } });
    if (!program) throw new NotFoundException(`Program ${dto.programId} not found`);
    if (program.status !== NominationProgramStatus.OPEN) throw new BadRequestException('This program is closed');
    if (!dto.nomineeEmployeeId || !dto.justification?.trim()) {
      throw new BadRequestException('nomineeEmployeeId and justification are required');
    }
    return this.nominationRepo.save(this.nominationRepo.create({
      tenantId,
      programId: dto.programId,
      nomineeEmployeeId: dto.nomineeEmployeeId,
      nomineeName: dto.nomineeName,
      nominatedByUserId: nominatedBy.userId,
      nominatedByName: nominatedBy.name,
      justification: dto.justification.trim(),
      votedBy: [],
      status: NominationStatus.SUBMITTED,
    }));
  }

  async listNominations(tenantId: string, programId: string): Promise<RecognitionNomination[]> {
    return this.nominationRepo.find({ where: { tenantId, programId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Panel vote: only configured panellists may vote, once each. Reaching the
   * program's votesToWin threshold auto-approves the nomination.
   */
  async vote(tenantId: string, nominationId: string, voterUserId: string): Promise<RecognitionNomination> {
    const nomination = await this.nominationRepo.findOne({ where: { id: nominationId, tenantId } });
    if (!nomination) throw new NotFoundException(`Nomination ${nominationId} not found`);
    if (nomination.status !== NominationStatus.SUBMITTED) {
      throw new BadRequestException(`Nomination is ${nomination.status}, voting is closed`);
    }
    const program = await this.programRepo.findOne({ where: { id: nomination.programId, tenantId } });
    if (!program) throw new NotFoundException('Program not found');
    if (program.panelUserIds.length && !program.panelUserIds.includes(voterUserId)) {
      throw new ForbiddenException('Only panel members can vote on this program');
    }
    if (!nomination.votedBy.includes(voterUserId)) {
      nomination.votedBy = [...nomination.votedBy, voterUserId];
    }
    if (program.votesToWin > 0 && nomination.votedBy.length >= program.votesToWin) {
      return this.decide(tenantId, nominationId, 'approve');
    }
    return this.nominationRepo.save(nomination);
  }

  /** Admin decision (or auto-approve on reaching quorum). */
  async decide(
    tenantId: string, nominationId: string, decision: 'approve' | 'reject',
    giver?: (recognition: {
      badgeId: string; toEmployeeId: string; toName: string; message: string;
    }) => Promise<{ id: string }>,
  ): Promise<RecognitionNomination> {
    const nomination = await this.nominationRepo.findOne({ where: { id: nominationId, tenantId } });
    if (!nomination) throw new NotFoundException(`Nomination ${nominationId} not found`);
    if (nomination.status !== NominationStatus.SUBMITTED) {
      throw new BadRequestException(`Nomination already ${nomination.status}`);
    }
    if (decision === 'reject') {
      nomination.status = NominationStatus.REJECTED;
      return this.nominationRepo.save(nomination);
    }
    nomination.status = NominationStatus.APPROVED;
    const program = await this.programRepo.findOne({ where: { id: nomination.programId, tenantId } });
    // Award a wall recognition when the program has a badge and a giver is wired.
    if (program?.badgeId && giver) {
      const recognition = await giver({
        badgeId: program.badgeId,
        toEmployeeId: nomination.nomineeEmployeeId,
        toName: nomination.nomineeName,
        message: `${program.name}: ${nomination.justification}`,
      }).catch(() => null);
      if (recognition) nomination.recognitionId = recognition.id;
    }
    return this.nominationRepo.save(nomination);
  }
}
