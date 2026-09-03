import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { Skill } from './entities/skill.entity';
import { EmployeeSkill } from './entities/employee-skill.entity';
import { SkillRelation, SkillRelationType } from './entities/skill-relation.entity';
import { ProficiencyDescriptor } from './entities/proficiency-descriptor.entity';
import { SkillAttestation, AttestationMethod, AttestationStatus } from './entities/skill-attestation.entity';
import { AutomationService } from '../../automation/automation.service';

/**
 * Depth layer over the skills catalog: the skill ontology graph, named
 * proficiency descriptors, and the attestation/verification workflow that
 * turns self-assessed skills into verified ones.
 */
@Injectable()
export class SkillOntologyService {
  constructor(
    @InjectRepository(Skill) private readonly skillRepo: Repository<Skill>,
    @InjectRepository(EmployeeSkill) private readonly empSkillRepo: Repository<EmployeeSkill>,
    @InjectRepository(SkillRelation) private readonly relationRepo: Repository<SkillRelation>,
    @InjectRepository(ProficiencyDescriptor) private readonly descriptorRepo: Repository<ProficiencyDescriptor>,
    @InjectRepository(SkillAttestation) private readonly attestationRepo: Repository<SkillAttestation>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  private async assertSkill(tenantId: string, skillId: string): Promise<Skill> {
    const skill = await this.skillRepo.findOne({ where: { id: skillId, tenantId } });
    if (!skill) throw new NotFoundException(`Skill ${skillId} not found`);
    return skill;
  }

  // ─── Ontology graph ───────────────────────────────────────────

  async addRelation(tenantId: string, dto: { fromSkillId: string; toSkillId: string; relationType?: SkillRelationType; note?: string }): Promise<SkillRelation> {
    if (dto.fromSkillId === dto.toSkillId) throw new BadRequestException('A skill cannot relate to itself');
    await this.assertSkill(tenantId, dto.fromSkillId);
    await this.assertSkill(tenantId, dto.toSkillId);
    const relationType = dto.relationType ?? SkillRelationType.RELATED;
    const existing = await this.relationRepo.findOne({ where: { tenantId, fromSkillId: dto.fromSkillId, toSkillId: dto.toSkillId, relationType } });
    if (existing) throw new BadRequestException('That relation already exists');
    return this.relationRepo.save(this.relationRepo.create({
      tenantId, fromSkillId: dto.fromSkillId, toSkillId: dto.toSkillId, relationType, note: dto.note ?? null,
    }));
  }

  async removeRelation(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const rel = await this.relationRepo.findOne({ where: { id, tenantId } });
    if (!rel) throw new NotFoundException(`Relation ${id} not found`);
    await this.relationRepo.remove(rel);
    return { deleted: true };
  }

  /**
   * Neighbourhood of a skill: outgoing relations plus incoming ones (with the
   * relation type inverted so it reads from the subject skill's point of view).
   */
  async neighbourhood(tenantId: string, skillId: string): Promise<Array<{ skillId: string; skillName: string; relationType: string; direction: 'OUT' | 'IN' }>> {
    await this.assertSkill(tenantId, skillId);
    const [out, incoming] = await Promise.all([
      this.relationRepo.find({ where: { tenantId, fromSkillId: skillId } }),
      this.relationRepo.find({ where: { tenantId, toSkillId: skillId } }),
    ]);
    const ids = new Set<string>([...out.map((r) => r.toSkillId), ...incoming.map((r) => r.fromSkillId)]);
    const skills = ids.size ? await this.skillRepo.find({ where: { tenantId, id: In([...ids]) } }) : [];
    const nameOf = new Map(skills.map((s) => [s.id, s.name]));
    return [
      ...out.map((r) => ({ skillId: r.toSkillId, skillName: nameOf.get(r.toSkillId) ?? 'Unknown', relationType: r.relationType, direction: 'OUT' as const })),
      ...incoming.map((r) => ({ skillId: r.fromSkillId, skillName: nameOf.get(r.fromSkillId) ?? 'Unknown', relationType: this.invert(r.relationType), direction: 'IN' as const })),
    ];
  }

  private invert(rt: SkillRelationType): string {
    if (rt === SkillRelationType.BROADER) return SkillRelationType.NARROWER;
    if (rt === SkillRelationType.NARROWER) return SkillRelationType.BROADER;
    if (rt === SkillRelationType.PREREQUISITE) return 'ENABLES';
    return rt;
  }

  /** Prerequisite chain for a skill (skills that must be held first). */
  async prerequisitesOf(tenantId: string, skillId: string): Promise<Array<{ skillId: string; skillName: string }>> {
    await this.assertSkill(tenantId, skillId);
    const rels = await this.relationRepo.find({ where: { tenantId, toSkillId: skillId, relationType: SkillRelationType.PREREQUISITE } });
    if (!rels.length) return [];
    const skills = await this.skillRepo.find({ where: { tenantId, id: In(rels.map((r) => r.fromSkillId)) } });
    const nameOf = new Map(skills.map((s) => [s.id, s.name]));
    return rels.map((r) => ({ skillId: r.fromSkillId, skillName: nameOf.get(r.fromSkillId) ?? 'Unknown' }));
  }

  // ─── Proficiency descriptors ──────────────────────────────────

  async setDescriptors(tenantId: string, skillId: string | null, descriptors: Array<{ level: number; label: string; description?: string }>): Promise<ProficiencyDescriptor[]> {
    if (skillId) await this.assertSkill(tenantId, skillId);
    const clean = (descriptors ?? []).filter((d) => d.label?.trim() && Number.isFinite(Number(d.level)));
    if (!clean.length) throw new BadRequestException('At least one descriptor with a level and label is required');
    // Replace the whole scale for this skill (or the global scale when null).
    const existing = await this.descriptorRepo.find({ where: { tenantId, skillId: skillId ?? (null as any) } });
    if (existing.length) await this.descriptorRepo.remove(existing);
    const rows = clean.map((d) => this.descriptorRepo.create({
      tenantId, skillId: skillId ?? null, level: Number(d.level), label: d.label.trim(), description: d.description ?? null,
    }));
    return this.descriptorRepo.save(rows);
  }

  async listDescriptors(tenantId: string, skillId?: string): Promise<ProficiencyDescriptor[]> {
    const rows = await this.descriptorRepo.find({ where: { tenantId, skillId: (skillId ?? null) as any } });
    return rows.sort((a, b) => a.level - b.level);
  }

  // ─── Attestation / verification ───────────────────────────────

  async requestAttestation(tenantId: string, dto: { employeeId: string; skillId: string; proficiencyClaimed: number; method?: AttestationMethod; attestedByUserId?: string; evidenceUrl?: string; note?: string; expiresAt?: string }): Promise<SkillAttestation> {
    const skill = await this.assertSkill(tenantId, dto.skillId);
    const prof = Number(dto.proficiencyClaimed);
    if (!(prof >= 1) || prof > skill.maxProficiency) {
      throw new BadRequestException(`proficiencyClaimed must be between 1 and ${skill.maxProficiency}`);
    }
    const method = dto.method ?? AttestationMethod.SELF;
    // Every attestation starts PENDING and awaits an approver's verification.
    return this.attestationRepo.save(this.attestationRepo.create({
      tenantId, employeeId: dto.employeeId, skillId: dto.skillId, proficiencyClaimed: prof,
      method, status: AttestationStatus.PENDING, attestedByUserId: dto.attestedByUserId ?? null,
      evidenceUrl: dto.evidenceUrl ?? null, note: dto.note ?? null, expiresAt: dto.expiresAt ?? null,
    }));
  }

  listAttestations(tenantId: string, filter: { employeeId?: string; skillId?: string; status?: AttestationStatus }): Promise<SkillAttestation[]> {
    const where: any = { tenantId };
    if (filter.employeeId) where.employeeId = filter.employeeId;
    if (filter.skillId) where.skillId = filter.skillId;
    if (filter.status) where.status = filter.status;
    return this.attestationRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /**
   * Verify an attestation. On verification the employee's catalog skill is
   * upserted to at least the attested proficiency, and skill.attested fires.
   */
  async verifyAttestation(tenantId: string, id: string, verifiedByUserId: string): Promise<SkillAttestation> {
    const att = await this.attestationRepo.findOne({ where: { id, tenantId } });
    if (!att) throw new NotFoundException(`Attestation ${id} not found`);
    if (att.status !== AttestationStatus.PENDING) throw new BadRequestException('Only PENDING attestations can be verified');
    att.status = AttestationStatus.VERIFIED;
    att.verifiedByUserId = verifiedByUserId;
    att.verifiedAt = new Date();
    const saved = await this.attestationRepo.save(att);

    // Sync into the employee's skill record (create or raise proficiency).
    const empSkill = await this.empSkillRepo.findOne({ where: { tenantId, employeeId: att.employeeId, skillId: att.skillId } });
    if (!empSkill) {
      await this.empSkillRepo.save(this.empSkillRepo.create({
        tenantId, employeeId: att.employeeId, skillId: att.skillId, proficiency: att.proficiencyClaimed, assessedBy: verifiedByUserId,
      }));
    } else if (att.proficiencyClaimed > empSkill.proficiency) {
      empSkill.proficiency = att.proficiencyClaimed;
      empSkill.assessedBy = verifiedByUserId;
      await this.empSkillRepo.save(empSkill);
    }

    await this.automation?.emit(tenantId, 'skill.attested', {
      attestationId: saved.id, employeeId: att.employeeId, skillId: att.skillId, proficiency: att.proficiencyClaimed, method: att.method,
    });
    return saved;
  }

  async rejectAttestation(tenantId: string, id: string, verifiedByUserId: string, note?: string): Promise<SkillAttestation> {
    const att = await this.attestationRepo.findOne({ where: { id, tenantId } });
    if (!att) throw new NotFoundException(`Attestation ${id} not found`);
    if (att.status !== AttestationStatus.PENDING) throw new BadRequestException('Only PENDING attestations can be rejected');
    att.status = AttestationStatus.REJECTED;
    att.verifiedByUserId = verifiedByUserId;
    if (note) att.note = note;
    return this.attestationRepo.save(att);
  }

  /** Mark verified certifications past their expiry as EXPIRED. `asOf` = today (YYYY-MM-DD). */
  async expireSweep(tenantId: string, asOf: string): Promise<{ expired: number }> {
    const due = await this.attestationRepo.find({ where: { tenantId, status: AttestationStatus.VERIFIED, expiresAt: LessThan(asOf) } });
    for (const a of due) { a.status = AttestationStatus.EXPIRED; }
    if (due.length) await this.attestationRepo.save(due);
    return { expired: due.length };
  }

  /**
   * Verification coverage for an employee: how many of their catalog skills are
   * backed by a verified (non-expired) attestation vs merely self-declared.
   */
  async attestationCoverage(tenantId: string, employeeId: string): Promise<{
    totalSkills: number; verified: number; selfOnly: number; coveragePct: number;
  }> {
    const [skills, attestations] = await Promise.all([
      this.empSkillRepo.find({ where: { tenantId, employeeId } }),
      this.attestationRepo.find({ where: { tenantId, employeeId, status: AttestationStatus.VERIFIED } }),
    ]);
    const verifiedSkillIds = new Set(attestations.map((a) => a.skillId));
    const verified = skills.filter((s) => verifiedSkillIds.has(s.skillId)).length;
    const total = skills.length;
    return {
      totalSkills: total, verified, selfOnly: total - verified,
      coveragePct: total ? Math.round((verified / total) * 100) : 0,
    };
  }
}
