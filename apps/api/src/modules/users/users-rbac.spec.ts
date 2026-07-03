import { Reflector } from '@nestjs/core';
import { UsersController } from './users.controller';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permission.decorator';

/**
 * Guards the fix for the "UsersController has no RBAC" gap: every mutating /
 * cross-user route must declare the expected permission, while self-service
 * routes (me / me/profile) must remain permission-free so any authenticated
 * user can manage their own profile.
 */
describe('UsersController — RBAC coverage', () => {
  const reflector = new Reflector();
  const proto = UsersController.prototype as any;
  const perms = (method: string): string[] | undefined =>
    reflector.get<string[]>(PERMISSIONS_KEY, proto[method]);

  it.each([
    ['findAll', 'users:users:read'],
    ['findById', 'users:users:read'],
    ['create', 'users:users:create'],
    ['invite', 'users:users:create'],
    ['bulkInvite', 'users:users:create'],
    ['update', 'users:users:update'],
    ['deactivate', 'users:users:delete'],
    ['unlock', 'users:users:update'],
  ])('%s requires %s', (method, expected) => {
    expect(perms(method)).toEqual([expected]);
  });

  it.each(['getMe', 'updateMe'])('self-service route %s has no permission requirement', (method) => {
    expect(perms(method)).toBeUndefined();
  });
});
