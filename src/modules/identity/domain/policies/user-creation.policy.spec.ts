import { describe, expect, it } from '@jest/globals';
import { canManageInUnits, canRoleCreate } from './user-creation.policy';
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

describe('canManageInUnits', () => {
  it('lets an ADMIN manage regardless of unit overlap (even with empty scopes)', () => {
    expect(canManageInUnits(UserRole.ADMIN, [], ['bu-1'])).toBe(true);
    expect(canManageInUnits(UserRole.ADMIN, ['bu-9'], ['bu-1'])).toBe(true);
  });

  it('lets a MANAGER manage a target whose units overlap their own', () => {
    expect(canManageInUnits(UserRole.MANAGER, ['bu-1', 'bu-2'], ['bu-2', 'bu-3'])).toBe(true);
  });

  it('blocks a MANAGER when scopes are disjoint', () => {
    expect(canManageInUnits(UserRole.MANAGER, ['bu-1'], ['bu-2'])).toBe(false);
  });

  it('blocks a MANAGER when either scope is empty', () => {
    expect(canManageInUnits(UserRole.MANAGER, [], ['bu-1'])).toBe(false);
    expect(canManageInUnits(UserRole.MANAGER, ['bu-1'], [])).toBe(false);
  });

  it.each([UserRole.ATTENDANT, UserRole.KITCHEN, UserRole.CUSTOMER])(
    '%s may not manage anyone',
    (actor) => {
      expect(canManageInUnits(actor, ['bu-1'], ['bu-1'])).toBe(false);
    },
  );
});
