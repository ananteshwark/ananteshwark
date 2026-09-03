import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SequenceService } from './sequence.service';
import { DocumentSequence } from './document-sequence.entity';

describe('SequenceService — atomic document numbering (H1)', () => {
  let service: SequenceService;
  let repo: any;

  beforeEach(async () => {
    repo = { query: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [SequenceService, { provide: getRepositoryToken(DocumentSequence), useValue: repo }],
    }).compile();
    service = moduleRef.get(SequenceService);
  });

  it('next() issues the value returned by the atomic upsert', async () => {
    repo.query.mockResolvedValue([{ next_value: '5' }]);
    const n = await service.next('t1', 'invoice');
    expect(n).toBe(5);
    // one atomic statement, parameterized by (tenant, key)
    expect(repo.query).toHaveBeenCalledTimes(1);
    const [sql, params] = repo.query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('RETURNING next_value');
    expect(params).toEqual(['t1', 'invoice']);
  });

  it('formatted() zero-pads with the given prefix', async () => {
    repo.query.mockResolvedValue([{ next_value: '7' }]);
    expect(await service.formatted('t1', 'cto-config', 'CTO-', 6)).toBe('CTO-000007');
  });
});
