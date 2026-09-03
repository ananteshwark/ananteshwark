import { ConflictException } from '@nestjs/common';

/**
 * Optimistic-concurrency guard for document updates.
 *
 * Entities carrying a `@VersionColumn() version` expose their counter to
 * clients; a client that read version N sends it back with the update. If
 * someone else saved in between (version moved on), the write is rejected
 * with 409 CONFLICT instead of silently last-write-wins.
 *
 * Passing no expectedVersion keeps legacy callers working (no check).
 */
export function assertVersion(
  entity: { version?: number },
  expectedVersion: number | undefined | null,
  what = 'record',
): void {
  if (expectedVersion === undefined || expectedVersion === null) return;
  const current = entity.version;
  if (current !== undefined && Number(expectedVersion) !== Number(current)) {
    throw new ConflictException(
      `This ${what} was modified by someone else (your version ${expectedVersion}, current ${current}). Reload and retry.`,
    );
  }
}
