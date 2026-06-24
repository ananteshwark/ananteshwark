/**
 * Lightweight test doubles for TypeORM repositories and query builders.
 * Used by the *.spec.ts unit tests to exercise service business logic
 * without a live database.
 */

export function mockQueryBuilder(result: any = [], raw: any = undefined): any {
  const builder: any = {};
  const chainMethods = [
    'where', 'andWhere', 'orWhere', 'select', 'addSelect', 'orderBy', 'addOrderBy',
    'leftJoin', 'leftJoinAndSelect', 'innerJoin', 'innerJoinAndSelect',
    'skip', 'take', 'limit', 'offset', 'groupBy', 'addGroupBy', 'having',
    'delete', 'update', 'set', 'values', 'from', 'into', 'insert',
  ];
  for (const m of chainMethods) builder[m] = jest.fn(() => builder);
  builder.getMany = jest.fn(async () => result);
  builder.getManyAndCount = jest.fn(async () => [result, Array.isArray(result) ? result.length : 0]);
  builder.getOne = jest.fn(async () => (Array.isArray(result) ? result[0] ?? null : result));
  builder.getRawOne = jest.fn(async () => raw);
  builder.getRawMany = jest.fn(async () => raw ?? []);
  builder.execute = jest.fn(async () => ({ affected: 0, raw: [] }));
  return builder;
}

export function mockRepo(): any {
  return {
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => x),
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    findBy: jest.fn(async () => []),
    findByIds: jest.fn(async () => []),
    count: jest.fn(async () => 0),
    update: jest.fn(async () => ({ affected: 1 })),
    delete: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(() => mockQueryBuilder([])),
  };
}

export function mockDataSource(mgr?: any): any {
  const manager = mgr ?? {
    save: jest.fn(async (x: any) => x),
    create: jest.fn((_entity: any, x: any) => x),
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
  };
  return {
    transaction: jest.fn(async (cb: any) => cb(manager)),
    manager,
  };
}
