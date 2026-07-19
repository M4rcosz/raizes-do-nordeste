import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import { UsersController } from './users.controller';
import { UserResponseDto } from '../dto/user-response.dto';
import { IS_PUBLIC_KEY } from '@shared/auth/public.decorator';
import { Roles } from '@shared/auth/roles.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { DEFAULT_LIMIT, MAX_LIMIT } from '@shared/pagination/pagination';
import { User } from '@modules/identity/domain/entities/user.entity';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { ChangePasswordUseCase } from '@modules/identity/application/use-cases/change-password.use-case';
import { CreateUserUseCase } from '@modules/identity/application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from '@modules/identity/application/use-cases/deactivate-user.use-case';
import { GetMyProfileUseCase } from '@modules/identity/application/use-cases/get-my-profile.use-case';
import { ListUsersUseCase } from '@modules/identity/application/use-cases/list-users.use-case';
import { LookupCustomerUseCase } from '@modules/identity/application/use-cases/lookup-customer.use-case';
import { ReactivateUserUseCase } from '@modules/identity/application/use-cases/reactivate-user.use-case';
import { RegisterCustomerUseCase } from '@modules/identity/application/use-cases/register-customer.use-case';
import { UpdateUserBusinessUnitsUseCase } from '@modules/identity/application/use-cases/update-user-business-units.use-case';
import { UpdateUserProfileUseCase } from '@modules/identity/application/use-cases/update-user-profile.use-case';

// Use cases are faked at their `execute` boundary. `unknown` args keep the fake
// assignable to every use-case signature without `never` poisoning the arg types.
type Fn = jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;

const useCase = (): { execute: Fn } => ({ execute: jest.fn() as Fn });

const buildUser = (overrides: Partial<{ id: string; role: UserRole }> = {}): User =>
  new User(
    overrides.id ?? 'u-target',
    ['bu-1'],
    'joao.atendente',
    'Joao Atendente',
    'joao@example.com',
    'argon2-hash-that-must-never-escape',
    '+5581988888888',
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
    null,
    overrides.role ?? UserRole.ATTENDANT,
    true,
  );

// A manager acting on someone else. `sub` is the actor; any id in the body or the
// route param is the target. Conflating the two is the classic privilege bug.
const ACTOR = {
  sub: 'u-actor',
  username: 'manager',
  role: UserRole.MANAGER,
  businessUnitIds: ['bu-1'],
  iat: 0,
  exp: 0,
} as JwtPayload;

describe('UsersController', () => {
  let registerCustomer: { execute: Fn };
  let createUser: { execute: Fn };
  let deactivateUser: { execute: Fn };
  let reactivateUser: { execute: Fn };
  let updateUserProfile: { execute: Fn };
  let getMyProfile: { execute: Fn };
  let changePassword: { execute: Fn };
  let listUsers: { execute: Fn };
  let updateUserBusinessUnits: { execute: Fn };
  let lookupCustomer: { execute: Fn };
  let controller: UsersController;

  beforeEach(() => {
    registerCustomer = useCase();
    createUser = useCase();
    deactivateUser = useCase();
    reactivateUser = useCase();
    updateUserProfile = useCase();
    getMyProfile = useCase();
    changePassword = useCase();
    listUsers = useCase();
    updateUserBusinessUnits = useCase();
    lookupCustomer = useCase();

    controller = new UsersController(
      registerCustomer as unknown as RegisterCustomerUseCase,
      createUser as unknown as CreateUserUseCase,
      deactivateUser as unknown as DeactivateUserUseCase,
      reactivateUser as unknown as ReactivateUserUseCase,
      updateUserProfile as unknown as UpdateUserProfileUseCase,
      getMyProfile as unknown as GetMyProfileUseCase,
      changePassword as unknown as ChangePasswordUseCase,
      listUsers as unknown as ListUsersUseCase,
      updateUserBusinessUnits as unknown as UpdateUserBusinessUnitsUseCase,
      lookupCustomer as unknown as LookupCustomerUseCase,
    );
  });

  // Self-registration is the only route on this controller that may be reached without
  // a token. Every other route losing its role gate would be a silent privilege hole,
  // so the gates are asserted as metadata rather than trusted to review.
  describe('route gating', () => {
    const reflector = new Reflector();

    it('exposes only register as public', () => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, UsersController.prototype.register)).toBe(true);
    });

    it.each([
      ['create', UsersController.prototype.create, ['ADMIN', 'MANAGER']],
      ['list', UsersController.prototype.list, ['ADMIN', 'MANAGER']],
      ['deactivate', UsersController.prototype.deactivate, ['ADMIN', 'MANAGER']],
      ['reactivate', UsersController.prototype.reactivate, ['ADMIN', 'MANAGER']],
      ['setBusinessUnits', UsersController.prototype.setBusinessUnits, ['ADMIN']],
      // KITCHEN is staff but never serves a customer, so it stays off this list.
      ['lookup', UsersController.prototype.lookup, ['ADMIN', 'MANAGER', 'ATTENDANT']],
      ['updateMe', UsersController.prototype.updateMe, ['CUSTOMER']],
    ])('gates %s behind %s', (_name, handler, expected) => {
      expect(reflector.get(Roles, handler)).toEqual(expected);
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
    });

    it.each([
      ['me', UsersController.prototype.me],
      ['changeMyPassword', UsersController.prototype.changeMyPassword],
    ])('leaves %s open to any authenticated role', (_name, handler) => {
      expect(reflector.get(Roles, handler)).toBeUndefined();
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
    });
  });

  describe('lookup', () => {
    // Nest resolves routes in declaration order. If a :id route were declared first,
    // GET /users/lookup would bind to it and 400 on the UUID param instead.
    it('is declared before every :id route', () => {
      const methods = Object.getOwnPropertyNames(UsersController.prototype);
      const idRoutes = ['deactivate', 'reactivate', 'setBusinessUnits'];

      for (const route of idRoutes) {
        expect(methods.indexOf('lookup')).toBeLessThan(methods.indexOf(route));
      }
    });

    it('forwards the phone term to the use case', async () => {
      lookupCustomer.execute.mockResolvedValue(buildUser({ role: UserRole.CUSTOMER }));

      await controller.lookup({ phone: '+5581988888888' } as never);

      expect(lookupCustomer.execute).toHaveBeenCalledWith({
        phone: '+5581988888888',
        email: undefined,
      });
    });

    it('forwards the email term to the use case', async () => {
      lookupCustomer.execute.mockResolvedValue(buildUser({ role: UserRole.CUSTOMER }));

      await controller.lookup({ email: 'joao@example.com' } as never);

      expect(lookupCustomer.execute).toHaveBeenCalledWith({
        phone: undefined,
        email: 'joao@example.com',
      });
    });

    // The response is the whole point of the narrow DTO: an attendant learns the
    // name to confirm, and nothing else about the account.
    it('returns only id and name, never the contact details or role', async () => {
      lookupCustomer.execute.mockResolvedValue(buildUser({ role: UserRole.CUSTOMER }));

      const result = await controller.lookup({ phone: '+5581988888888' } as never);

      expect({ ...result }).toEqual({ id: 'u-target', name: 'Joao Atendente' });
    });
  });

  describe('register', () => {
    it('passes the body straight through', async () => {
      registerCustomer.execute.mockResolvedValue(buildUser({ role: UserRole.CUSTOMER }));
      const body = { name: 'Ana', username: 'ana', password: 'supersecret' };

      const result = await controller.register(body as never);

      expect(registerCustomer.execute).toHaveBeenCalledWith(body);
      expect(result).toBeInstanceOf(UserResponseDto);
    });
  });

  // The actor is always the JWT subject. If any of these read an id out of the
  // request instead, a caller could act as another user.
  describe('actor identity comes from the token, never from the request', () => {
    it('create passes the token subject as the actor', async () => {
      createUser.execute.mockResolvedValue(buildUser());
      const body = {
        name: 'Ana',
        username: 'ana',
        password: 'supersecret',
        role: UserRole.KITCHEN,
      };

      await controller.create(ACTOR, body as never);

      expect(createUser.execute).toHaveBeenCalledWith(
        { id: 'u-actor', role: UserRole.MANAGER, businessUnitIds: ['bu-1'] },
        body,
      );
    });

    // Named for what it checks. The controller does NOT strip an unknown `id` from
    // the body - it forwards the body untouched, and the DTO whitelist is what
    // rejects the field (see create-user-request.dto.spec.ts). All this asserts is
    // that a body id never displaces the token subject as the actor.
    it('create derives the actor from the token even when the body carries an id', async () => {
      createUser.execute.mockResolvedValue(buildUser());
      const body = { id: 'u-someone-else', name: 'Ana' };

      await controller.create(ACTOR, body as never);

      const [actorArg, bodyArg] = createUser.execute.mock.calls[0];
      expect(actorArg).toEqual({
        id: 'u-actor',
        role: UserRole.MANAGER,
        businessUnitIds: ['bu-1'],
      });
      // Pass-through is the real behaviour; pinning it means a future controller
      // that starts trusting body.id has to change this test on purpose.
      expect(bodyArg).toBe(body);
    });

    it('deactivate sends the actor from the token and the target from the route param', async () => {
      deactivateUser.execute.mockResolvedValue(buildUser());

      await controller.deactivate(ACTOR, { id: 'u-target' });

      expect(deactivateUser.execute).toHaveBeenCalledWith(
        { id: 'u-actor', role: UserRole.MANAGER, businessUnitIds: ['bu-1'] },
        'u-target',
      );
    });

    it('reactivate sends the actor from the token and the target from the route param', async () => {
      reactivateUser.execute.mockResolvedValue(buildUser());

      await controller.reactivate(ACTOR, { id: 'u-target' });

      expect(reactivateUser.execute).toHaveBeenCalledWith(
        { id: 'u-actor', role: UserRole.MANAGER, businessUnitIds: ['bu-1'] },
        'u-target',
      );
    });

    // Swapping actor and target here would let an admin rewrite their own scope
    // while appearing to edit somebody else's.
    it('setBusinessUnits keeps actor and target distinct', async () => {
      updateUserBusinessUnits.execute.mockResolvedValue(buildUser());

      await controller.setBusinessUnits(ACTOR, { id: 'u-target' }, {
        businessUnitIds: ['bu-9'],
      } as never);

      expect(updateUserBusinessUnits.execute).toHaveBeenCalledWith(
        { id: 'u-actor', role: UserRole.MANAGER },
        'u-target',
        ['bu-9'],
      );
    });

    it('me resolves the token subject', async () => {
      getMyProfile.execute.mockResolvedValue(buildUser());

      await controller.me(ACTOR);

      expect(getMyProfile.execute).toHaveBeenCalledWith('u-actor');
    });

    it('updateMe targets the token subject, not any id in the body', async () => {
      updateUserProfile.execute.mockResolvedValue(buildUser());
      const body = { name: 'Novo Nome' };

      await controller.updateMe(ACTOR, body as never);

      expect(updateUserProfile.execute).toHaveBeenCalledWith('u-actor', body);
    });

    it('changeMyPassword targets the token subject and returns no body', async () => {
      changePassword.execute.mockResolvedValue(undefined);
      const body = { currentPassword: 'old-secret', newPassword: 'new-secret' };

      const result = await controller.changeMyPassword(ACTOR, body as never);

      expect(changePassword.execute).toHaveBeenCalledWith('u-actor', body);
      expect(result).toBeUndefined();
    });
  });

  describe('list', () => {
    const meta = { limit: DEFAULT_LIMIT, nextCursor: null, hasMore: false };

    it('forwards the actor scope and the query filters', async () => {
      listUsers.execute.mockResolvedValue({ data: [buildUser()], meta });

      await controller.list(ACTOR, {
        businessUnitId: 'bu-1',
        username: 'joao',
        email: 'joao@',
        role: UserRole.CUSTOMER,
        cursor: 'u-0',
        limit: 10,
      } as never);

      expect(listUsers.execute).toHaveBeenCalledWith({
        actor: { role: UserRole.MANAGER, businessUnitIds: ['bu-1'] },
        businessUnitId: 'bu-1',
        username: 'joao',
        email: 'joao@',
        role: UserRole.CUSTOMER,
        cursor: 'u-0',
        limit: 10,
      });
    });

    it('applies the default limit when the query omits it', async () => {
      listUsers.execute.mockResolvedValue({ data: [], meta });

      await controller.list(ACTOR, {} as never);

      expect(listUsers.execute).toHaveBeenCalledWith(
        expect.objectContaining({ limit: DEFAULT_LIMIT }),
      );
    });

    // sanitizeLimit is the defence against `?limit=999999` resource exhaustion.
    it('clamps an oversized limit to the maximum', async () => {
      listUsers.execute.mockResolvedValue({ data: [], meta });

      await controller.list(ACTOR, { limit: 999999 } as never);

      expect(listUsers.execute).toHaveBeenCalledWith(expect.objectContaining({ limit: MAX_LIMIT }));
    });

    it('wraps the rows in the pagination envelope', async () => {
      listUsers.execute.mockResolvedValue({ data: [buildUser()], meta });

      const result = await controller.list(ACTOR, {} as never);

      expect(result.meta).toEqual(meta);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toBeInstanceOf(UserResponseDto);
    });
  });
});

// The entity holds the argon2 hash. The DTO is the boundary that keeps it in.
describe('UserResponseDto.fromEntity', () => {
  it('exposes exactly the public-safe fields', () => {
    const dto = UserResponseDto.fromEntity(buildUser());

    expect(Object.keys(dto).sort()).toEqual([
      'businessUnitIds',
      'email',
      'id',
      'isActive',
      'name',
      'phone',
      'role',
      'username',
    ]);
  });

  it('never carries the password hash, under any key', () => {
    const dto = UserResponseDto.fromEntity(buildUser());

    expect(JSON.stringify(dto)).not.toContain('argon2-hash-that-must-never-escape');
  });
});
