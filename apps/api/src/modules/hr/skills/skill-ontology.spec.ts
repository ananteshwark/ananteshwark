import { BadRequestException } from '@nestjs/common';
import { SkillOntologyService } from './skill-ontology.service';
import { SkillRelationType } from './entities/skill-relation.entity';
import { AttestationMethod, AttestationStatus } from './entities/skill-attestation.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  remove: jest.fn((x: any) => Promise.resolve(x)),
});

describe('SkillOntologyService', () => {
  let service: SkillOntologyService;
  let skillRepo: any, empSkillRepo: any, relationRepo: any, descriptorRepo: any, attestationRepo: any, automation: any;

  beforeEach(() => {
    skillRepo = mockRepo(); empSkillRepo = mockRepo(); relationRepo = mockRepo();
    descriptorRepo = mockRepo(); attestationRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new SkillOntologyService(skillRepo, empSkillRepo, relationRepo, descriptorRepo, attestationRepo, automation);
  });

  describe('ontology', () => {
    it('adds a relation between two distinct skills', async () => {
      skillRepo.findOne.mockResolvedValue({ id: 's', tenantId: 't1' });
      relationRepo.findOne.mockResolvedValue(null);
      const rel = await service.addRelation('t1', { fromSkillId: 'a', toSkillId: 'b', relationType: SkillRelationType.PREREQUISITE });
      expect(rel).toMatchObject({ fromSkillId: 'a', toSkillId: 'b', relationType: SkillRelationType.PREREQUISITE });
    });

    it('rejects a self-relation', async () => {
      await expect(service.addRelation('t1', { fromSkillId: 'a', toSkillId: 'a' })).rejects.toThrow(BadRequestException);
    });

    it('rejects a duplicate relation', async () => {
      skillRepo.findOne.mockResolvedValue({ id: 's', tenantId: 't1' });
      relationRepo.findOne.mockResolvedValue({ id: 'r1' });
      await expect(service.addRelation('t1', { fromSkillId: 'a', toSkillId: 'b' })).rejects.toThrow(BadRequestException);
    });

    it('builds a neighbourhood with inverted incoming relations', async () => {
      skillRepo.findOne.mockResolvedValue({ id: 'x', tenantId: 't1' });
      relationRepo.find
        .mockResolvedValueOnce([{ toSkillId: 'b', relationType: SkillRelationType.RELATED }]) // outgoing
        .mockResolvedValueOnce([{ fromSkillId: 'c', relationType: SkillRelationType.BROADER }]); // incoming
      skillRepo.find.mockResolvedValue([{ id: 'b', name: 'B' }, { id: 'c', name: 'C' }]);
      const hood = await service.neighbourhood('t1', 'x');
      expect(hood).toEqual(expect.arrayContaining([
        { skillId: 'b', skillName: 'B', relationType: 'RELATED', direction: 'OUT' },
        { skillId: 'c', skillName: 'C', relationType: 'NARROWER', direction: 'IN' }, // BROADER inverted
      ]));
    });
  });

  describe('proficiency descriptors', () => {
    it('replaces the scale and drops blank labels', async () => {
      skillRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1' });
      descriptorRepo.find.mockResolvedValue([{ id: 'old' }]);
      const rows = await service.setDescriptors('t1', 's1', [
        { level: 1, label: 'Novice' }, { level: 2, label: '  ' }, { level: 3, label: 'Expert' },
      ]);
      expect(descriptorRepo.remove).toHaveBeenCalled();
      expect(rows).toHaveLength(2);
    });

    it('rejects an empty descriptor set', async () => {
      await expect(service.setDescriptors('t1', null, [])).rejects.toThrow(BadRequestException);
    });
  });

  describe('attestation', () => {
    it('rejects a proficiency above the skill max', async () => {
      skillRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', maxProficiency: 5 });
      await expect(service.requestAttestation('t1', { employeeId: 'e1', skillId: 's1', proficiencyClaimed: 7 }))
        .rejects.toThrow(BadRequestException);
    });

    it('records a PENDING attestation', async () => {
      skillRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', maxProficiency: 5 });
      const att = await service.requestAttestation('t1', { employeeId: 'e1', skillId: 's1', proficiencyClaimed: 3, method: AttestationMethod.CERTIFICATION });
      expect(att).toMatchObject({ status: AttestationStatus.PENDING, method: AttestationMethod.CERTIFICATION });
    });

    it('verifies an attestation, upserts the employee skill and emits skill.attested', async () => {
      attestationRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', employeeId: 'e1', skillId: 's1', proficiencyClaimed: 4, status: AttestationStatus.PENDING, method: AttestationMethod.MANAGER });
      empSkillRepo.findOne.mockResolvedValue(null);
      const saved = await service.verifyAttestation('t1', 'a1', 'mgr1');
      expect(saved.status).toBe(AttestationStatus.VERIFIED);
      expect(saved.verifiedAt).toBeInstanceOf(Date);
      expect(empSkillRepo.save).toHaveBeenCalled();
      expect(automation.emit).toHaveBeenCalledWith('t1', 'skill.attested', expect.objectContaining({ skillId: 's1', proficiency: 4 }));
    });

    it('raises the employee proficiency only when the attestation is higher', async () => {
      attestationRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', employeeId: 'e1', skillId: 's1', proficiencyClaimed: 2, status: AttestationStatus.PENDING, method: AttestationMethod.MANAGER });
      empSkillRepo.findOne.mockResolvedValue({ id: 'es1', proficiency: 5 });
      await service.verifyAttestation('t1', 'a1', 'mgr1');
      // existing proficiency (5) already higher than claim (2) → no employee-skill save
      expect(empSkillRepo.save).not.toHaveBeenCalled();
    });

    it('cannot verify a non-PENDING attestation', async () => {
      attestationRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', status: AttestationStatus.VERIFIED });
      await expect(service.verifyAttestation('t1', 'a1', 'mgr1')).rejects.toThrow(BadRequestException);
    });

    it('expires verified certifications past their date', async () => {
      attestationRepo.find.mockResolvedValue([{ status: AttestationStatus.VERIFIED }, { status: AttestationStatus.VERIFIED }]);
      const res = await service.expireSweep('t1', '2026-07-10');
      expect(res.expired).toBe(2);
    });

    it('computes verified vs self-declared coverage', async () => {
      empSkillRepo.find.mockResolvedValue([{ skillId: 's1' }, { skillId: 's2' }, { skillId: 's3' }, { skillId: 's4' }]);
      attestationRepo.find.mockResolvedValue([{ skillId: 's1' }, { skillId: 's2' }]);
      const cov = await service.attestationCoverage('t1', 'e1');
      expect(cov).toMatchObject({ totalSkills: 4, verified: 2, selfOnly: 2, coveragePct: 50 });
    });
  });
});
