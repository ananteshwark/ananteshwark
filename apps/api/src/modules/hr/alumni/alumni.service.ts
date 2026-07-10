import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import {
  AlumniProfile, AlumniStatus, AlumniDocument, AlumniDocType,
  AlumniTicket, AlumniTicketCategory, AlumniTicketStatus,
} from './entities/alumni.entity';
import { AutomationService } from '../../automation/automation.service';

@Injectable()
export class AlumniService {
  constructor(
    @InjectRepository(AlumniProfile) private readonly profileRepo: Repository<AlumniProfile>,
    @InjectRepository(AlumniDocument) private readonly docRepo: Repository<AlumniDocument>,
    @InjectRepository(AlumniTicket) private readonly ticketRepo: Repository<AlumniTicket>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Profiles ─────────────────────────────────────────────────

  /** Invite a departing employee into the alumni network. */
  async invite(tenantId: string, dto: { employeeId: string; fullName: string; exitDate?: string; lastRole?: string; tenureMonths?: number; personalEmail?: string; rehireEligible?: boolean }): Promise<AlumniProfile> {
    if (!dto.employeeId || !dto.fullName?.trim()) throw new BadRequestException('employeeId and fullName are required');
    const existing = await this.profileRepo.findOne({ where: { tenantId, employeeId: dto.employeeId } });
    if (existing) throw new BadRequestException('An alumni profile already exists for this employee');
    const profile = await this.profileRepo.save(this.profileRepo.create({
      tenantId, employeeId: dto.employeeId, fullName: dto.fullName.trim(),
      exitDate: dto.exitDate ?? null, lastRole: dto.lastRole ?? null, tenureMonths: dto.tenureMonths ?? null,
      personalEmail: dto.personalEmail ?? null, rehireEligible: dto.rehireEligible !== false,
      skills: [], status: AlumniStatus.INVITED,
    }));
    await this.automation?.emit(tenantId, 'alumni.invited', {
      alumniProfileId: profile.id, employeeId: dto.employeeId, exitDate: profile.exitDate,
    });
    return profile;
  }

  async getProfile(tenantId: string, id: string): Promise<AlumniProfile> {
    const profile = await this.profileRepo.findOne({ where: { id, tenantId } });
    if (!profile) throw new NotFoundException(`Alumni profile ${id} not found`);
    return profile;
  }

  async activate(tenantId: string, id: string): Promise<AlumniProfile> {
    const profile = await this.getProfile(tenantId, id);
    if (profile.status === AlumniStatus.DEACTIVATED) throw new BadRequestException('Reactivate a deactivated profile via updateProfile');
    profile.status = AlumniStatus.ACTIVE;
    profile.activatedAt = profile.activatedAt ?? new Date();
    return this.profileRepo.save(profile);
  }

  /** Alumni self-service updates to their own profile. */
  async updateProfile(tenantId: string, id: string, dto: Partial<Pick<AlumniProfile, 'personalEmail' | 'currentEmployer' | 'currentTitle' | 'linkedInUrl' | 'location' | 'willingToBeRehired' | 'directoryOptIn' | 'skills'>>): Promise<AlumniProfile> {
    const profile = await this.getProfile(tenantId, id);
    const fields: (keyof typeof dto)[] = ['personalEmail', 'currentEmployer', 'currentTitle', 'linkedInUrl', 'location', 'willingToBeRehired', 'directoryOptIn', 'skills'];
    for (const f of fields) if (dto[f] !== undefined) (profile as any)[f] = dto[f];
    return this.profileRepo.save(profile);
  }

  async deactivate(tenantId: string, id: string): Promise<AlumniProfile> {
    const profile = await this.getProfile(tenantId, id);
    profile.status = AlumniStatus.DEACTIVATED;
    profile.directoryOptIn = false;
    return this.profileRepo.save(profile);
  }

  /** Public alumni directory — opt-in, active profiles only, searchable by name/employer. */
  async directory(tenantId: string, search?: string): Promise<AlumniProfile[]> {
    const base: any = { tenantId, status: AlumniStatus.ACTIVE, directoryOptIn: true };
    const where = search?.trim()
      ? [{ ...base, fullName: ILike(`%${search.trim()}%`) }, { ...base, currentEmployer: ILike(`%${search.trim()}%`) }]
      : base;
    return this.profileRepo.find({ where, order: { fullName: 'ASC' } });
  }

  listProfiles(tenantId: string, status?: AlumniStatus): Promise<AlumniProfile[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.profileRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Rehire-eligible alumni who have flagged interest in returning (boomerang pool). */
  async rehireCandidates(tenantId: string): Promise<AlumniProfile[]> {
    return this.profileRepo.find({
      where: { tenantId, willingToBeRehired: true, rehireEligible: true },
      order: { exitDate: 'DESC' },
    });
  }

  // ─── Documents ────────────────────────────────────────────────

  async addDocument(tenantId: string, profileId: string, dto: { docType?: AlumniDocType; title: string; period?: string; fileRef?: string; issuedAt?: string }): Promise<AlumniDocument> {
    await this.getProfile(tenantId, profileId);
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    return this.docRepo.save(this.docRepo.create({
      tenantId, alumniProfileId: profileId, docType: dto.docType ?? AlumniDocType.OTHER,
      title: dto.title.trim(), period: dto.period ?? null, fileRef: dto.fileRef ?? null, issuedAt: dto.issuedAt ?? null,
    }));
  }

  listDocuments(tenantId: string, profileId: string, docType?: AlumniDocType): Promise<AlumniDocument[]> {
    const where: any = { tenantId, alumniProfileId: profileId };
    if (docType) where.docType = docType;
    return this.docRepo.find({ where, order: { issuedAt: 'DESC', createdAt: 'DESC' } });
  }

  // ─── Tickets ──────────────────────────────────────────────────

  async raiseTicket(tenantId: string, profileId: string, dto: { category?: AlumniTicketCategory; subject: string; description?: string }): Promise<AlumniTicket> {
    await this.getProfile(tenantId, profileId);
    if (!dto.subject?.trim()) throw new BadRequestException('subject is required');
    const ticket = await this.ticketRepo.save(this.ticketRepo.create({
      tenantId, alumniProfileId: profileId, category: dto.category ?? AlumniTicketCategory.GENERAL,
      subject: dto.subject.trim(), description: dto.description ?? null, status: AlumniTicketStatus.OPEN,
    }));
    await this.automation?.emit(tenantId, 'alumni.ticket_raised', {
      ticketId: ticket.id, alumniProfileId: profileId, category: ticket.category,
    });
    return ticket;
  }

  listTickets(tenantId: string, filter: { profileId?: string; status?: AlumniTicketStatus }): Promise<AlumniTicket[]> {
    const where: any = { tenantId };
    if (filter.profileId) where.alumniProfileId = filter.profileId;
    if (filter.status) where.status = filter.status;
    return this.ticketRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async assignTicket(tenantId: string, ticketId: string, assignedToUserId: string): Promise<AlumniTicket> {
    const ticket = await this.findTicket(tenantId, ticketId);
    ticket.assignedToUserId = assignedToUserId;
    if (ticket.status === AlumniTicketStatus.OPEN) ticket.status = AlumniTicketStatus.IN_PROGRESS;
    return this.ticketRepo.save(ticket);
  }

  async resolveTicket(tenantId: string, ticketId: string, resolution: string): Promise<AlumniTicket> {
    const ticket = await this.findTicket(tenantId, ticketId);
    if (ticket.status === AlumniTicketStatus.CLOSED) throw new BadRequestException('Ticket is already closed');
    ticket.status = AlumniTicketStatus.RESOLVED;
    ticket.resolution = resolution ?? null;
    ticket.resolvedAt = new Date();
    return this.ticketRepo.save(ticket);
  }

  async closeTicket(tenantId: string, ticketId: string): Promise<AlumniTicket> {
    const ticket = await this.findTicket(tenantId, ticketId);
    ticket.status = AlumniTicketStatus.CLOSED;
    return this.ticketRepo.save(ticket);
  }

  private async findTicket(tenantId: string, ticketId: string): Promise<AlumniTicket> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId, tenantId } });
    if (!ticket) throw new NotFoundException(`Alumni ticket ${ticketId} not found`);
    return ticket;
  }
}
