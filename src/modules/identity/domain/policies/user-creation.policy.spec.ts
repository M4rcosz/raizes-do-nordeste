import { describe, expect, it } from '@jest/globals';
import { canRoleCreate } from './user-creation.policy';
import { UserRole } from '../value-objects/user-role';

describe('canRoleCreate', () => {
  const allRoles: UserRole[] = [
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.ATTENDANT,
    UserRole.KITCHEN,
    UserRole.CUSTOMER,
  ];

  describe('ADMIN actor', () => {
    it.each(allRoles)('may create %s', (target) => {
      expect(canRoleCreate(UserRole.ADMIN, target)).toBe(true);
    });
  });

  describe('MANAGER actor', () => {
    it('may create ATTENDANT', () => {
      expect(canRoleCreate(UserRole.MANAGER, UserRole.ATTENDANT)).toBe(true);
    });

    it('may create KITCHEN', () => {
      expect(canRoleCreate(UserRole.MANAGER, UserRole.KITCHEN)).toBe(true);
    });

    it.each([UserRole.ADMIN, UserRole.MANAGER, UserRole.CUSTOMER])(
      'may not create %s',
      (target) => {
        expect(canRoleCreate(UserRole.MANAGER, target)).toBe(false);
      },
    );
  });

  describe('non-privileged actors', () => {
    it.each([UserRole.ATTENDANT, UserRole.KITCHEN, UserRole.CUSTOMER])(
      '%s may not create any role',
      (actor) => {
        for (const target of allRoles) {
          expect(canRoleCreate(actor, target)).toBe(false);
        }
      },
    );
  });
});
