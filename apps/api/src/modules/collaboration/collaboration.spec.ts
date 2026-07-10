import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CollaborationService } from './collaboration.service';
import {
  CollaboratorType, CollaboratorStatus, CollaboratorResourceType, AssignmentStatus,
  SubmissionKind, SubmissionStatus,
} from './entities/collaborator.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('CollaborationService', () => {
  let service: CollaborationService;
  let collabRepo: any, assignmentRepo: any, submissionRepo: any, automation: any;

  beforeEach(() => {
    collabRepo = mockRepo(); assignmentRepo = mockRepo(); submissionRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new CollaborationService(collabRepo, assignmentRepo, submissionRepo, automation);
  });

  describe('invite', () => {
    it('invites a collaborator (email lower-cased) and emits an event', async () => {
      collabRepo.findOne.mockResolvedValue(null);
      const c = await service.invite('t1', { type: CollaboratorType.RECRUITER, orgName: 'Acme Talent', email: 'A@B.COM' });
      expect(c).toMatchObject({ email: 'a@b.com', status: CollaboratorStatus.INVITED });
      expect(automation.emit).toHaveBeenCalledWith('t1', 'collaborator.invited', expect.objectContaining({ type: CollaboratorType.RECRUITER }));
    });

    it('rejects a duplicate email', async () => {
      collabRepo.findOne.mockResolvedValue({ id: 'x' });
      await expect(service.invite('t1', { type: CollaboratorType.RECRUITER, orgName: 'Acme', email: 'a@b.com' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('assignments', () => {
    it('assigns a resource to an active collaborator', async () => {
      collabRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CollaboratorStatus.ACTIVE });
      assignmentRepo.findOne.mockResolvedValue(null);
      const a = await service.assignResource('t1', 'c1', { resourceType: CollaboratorResourceType.JOB, resourceId: 'job1' });
      expect(a).toMatchObject({ resourceId: 'job1', status: AssignmentStatus.ASSIGNED });
    });

    it('refuses to assign to a suspended collaborator', async () => {
      collabRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CollaboratorStatus.SUSPENDED });
      await expect(service.assignResource('t1', 'c1', { resourceType: CollaboratorResourceType.JOB, resourceId: 'job1' })).rejects.toThrow(BadRequestException);
    });

    it('refuses a duplicate assignment', async () => {
      collabRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CollaboratorStatus.ACTIVE });
      assignmentRepo.findOne.mockResolvedValue({ id: 'a1' });
      await expect(service.assignResource('t1', 'c1', { resourceType: CollaboratorResourceType.JOB, resourceId: 'job1' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('assertAccess (record-level scoping)', () => {
    it('grants access to an active collaborator with an open assignment', async () => {
      collabRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CollaboratorStatus.ACTIVE, accessExpiresAt: null });
      assignmentRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', collaboratorId: 'c1', status: AssignmentStatus.ASSIGNED });
      const { assignment } = await service.assertAccess('t1', 'c1', 'a1', '2026-07-10');
      expect(assignment.id).toBe('a1');
    });

    it('denies a suspended collaborator', async () => {
      collabRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CollaboratorStatus.SUSPENDED });
      await expect(service.assertAccess('t1', 'c1', 'a1', '2026-07-10')).rejects.toThrow(ForbiddenException);
    });

    it('denies when access has expired', async () => {
      collabRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CollaboratorStatus.ACTIVE, accessExpiresAt: '2026-01-01' });
      await expect(service.assertAccess('t1', 'c1', 'a1', '2026-07-10')).rejects.toThrow(ForbiddenException);
    });

    it('denies access to another collaborator\'s assignment', async () => {
      collabRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CollaboratorStatus.ACTIVE, accessExpiresAt: null });
      assignmentRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', collaboratorId: 'OTHER', status: AssignmentStatus.ASSIGNED });
      await expect(service.assertAccess('t1', 'c1', 'a1', '2026-07-10')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('submit & review', () => {
    it('submits against an assignment, flips it to SUBMITTED and emits an event', async () => {
      collabRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: CollaboratorStatus.ACTIVE, accessExpiresAt: null });
      assignmentRepo.findOne.mockResolvedValue({ id: 'a1', tenantId: 't1', collaboratorId: 'c1', status: AssignmentStatus.ASSIGNED, resourceType: CollaboratorResourceType.JOB, resourceId: 'job1' });
      const sub = await service.submit('t1', 'c1', 'a1', { kind: SubmissionKind.CANDIDATE, payload: { name: 'Jo' } }, '2026-07-10');
      expect(sub).toMatchObject({ kind: SubmissionKind.CANDIDATE, status: SubmissionStatus.SUBMITTED });
      expect(assignmentRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: AssignmentStatus.SUBMITTED }));
      expect(automation.emit).toHaveBeenCalledWith('t1', 'collaborator.submission_received', expect.objectContaining({ kind: SubmissionKind.CANDIDATE }));
    });

    it('accepts a submission on review', async () => {
      submissionRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', status: SubmissionStatus.SUBMITTED });
      const r = await service.reviewSubmission('t1', 's1', { accept: true, reviewedByUserId: 'u1' });
      expect(r.status).toBe(SubmissionStatus.ACCEPTED);
    });

    it('cannot review an already-reviewed submission', async () => {
      submissionRepo.findOne.mockResolvedValue({ id: 's1', tenantId: 't1', status: SubmissionStatus.ACCEPTED });
      await expect(service.reviewSubmission('t1', 's1', { accept: false, reviewedByUserId: 'u1' })).rejects.toThrow(BadRequestException);
    });
  });
});
