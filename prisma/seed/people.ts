import { PrismaClient, Role } from '@prisma/client';
import { seedId } from './ids';
import { daysAgo } from './clock';
import type { Catalog, UnitKey } from './catalog';

export type StaffKey =
  | 'clara'
  | 'rafael'
  | 'bianca'
  | 'diego'
  | 'helena'
  | 'tiago'
  | 'sofia'
  | 'lucas';

export type CustomerKey =
  | 'ana'
  | 'bruno'
  | 'carla'
  | 'daniel'
  | 'erika'
  | 'felipe'
  | 'gabriela'
  | 'henrique'
  | 'igor';

export type PersonKey = StaffKey | CustomerKey;

export interface People {
  ids: Record<PersonKey, string>;
  /** Customers that have a loyalty account, keyed the same way as ids. */
  loyaltyAccountIds: Partial<Record<CustomerKey, string>>;
  /** Whether LGPD consent still stands: earning stops when it is withdrawn. */
  loyaltyConsent: Partial<Record<CustomerKey, boolean>>;
}

const STAFF: {
  key: StaffKey;
  username: string;
  name: string;
  role: Role;
  units: UnitKey[];
  isActive?: boolean;
}[] = [
  {
    key: 'clara',
    username: 'clara.mendes',
    name: 'Clara Mendes',
    role: 'MANAGER',
    units: ['uberlandia'],
  },
  {
    key: 'rafael',
    username: 'rafael.souza',
    name: 'Rafael Souza',
    role: 'ATTENDANT',
    units: ['uberlandia'],
  },
  {
    key: 'bianca',
    username: 'bianca.rocha',
    name: 'Bianca Rocha',
    role: 'KITCHEN',
    units: ['araguari'],
  },
  {
    key: 'diego',
    username: 'diego.alves',
    name: 'Diego Alves',
    role: 'ATTENDANT',
    units: ['araguari'],
  },
  // Multi-unit manager: the whole point of the User <-> BusinessUnit N:N, and the
  // case a single businessUnitId claim could not express.
  {
    key: 'helena',
    username: 'helena.dias',
    name: 'Helena Dias',
    role: 'MANAGER',
    units: ['uberaba', 'patos'],
  },
  {
    key: 'tiago',
    username: 'tiago.moreira',
    name: 'Tiago Moreira',
    role: 'ATTENDANT',
    units: ['uberaba'],
  },
  {
    key: 'sofia',
    username: 'sofia.barros',
    name: 'Sofia Barros',
    role: 'KITCHEN',
    units: ['uberaba'],
  },
  // Deactivated staff: still attached to past orders, must be refused at sign-in.
  {
    key: 'lucas',
    username: 'lucas.ferraz',
    name: 'Lucas Ferraz',
    role: 'ATTENDANT',
    units: ['patos'],
    isActive: false,
  },
];

const CUSTOMERS: {
  key: CustomerKey;
  username: string;
  name: string;
  phone: string;
  isActive?: boolean;
  /** Absent means the customer never enrolled in loyalty. */
  loyalty?: { consentGiven: boolean; consentDaysAgo: number; revokedDaysAgo?: number };
}[] = [
  {
    key: 'ana',
    username: 'ana.lima',
    name: 'Ana Lima',
    phone: '34988800001',
    loyalty: { consentGiven: true, consentDaysAgo: 180 },
  },
  {
    key: 'bruno',
    username: 'bruno.castro',
    name: 'Bruno Castro',
    phone: '34988800002',
    loyalty: { consentGiven: true, consentDaysAgo: 150 },
  },
  {
    key: 'carla',
    username: 'carla.souza',
    name: 'Carla Souza',
    phone: '34988800003',
    loyalty: { consentGiven: true, consentDaysAgo: 90 },
  },
  {
    key: 'daniel',
    username: 'daniel.rocha',
    name: 'Daniel Rocha',
    phone: '34988800004',
    loyalty: { consentGiven: true, consentDaysAgo: 60 },
  },
  // LGPD consent withdrawn: the account survives, earning must not resume.
  {
    key: 'erika',
    username: 'erika.nunes',
    name: 'Erika Nunes',
    phone: '34988800005',
    loyalty: { consentGiven: false, consentDaysAgo: 200, revokedDaysAgo: 20 },
  },
  {
    key: 'felipe',
    username: 'felipe.andrade',
    name: 'Felipe Andrade',
    phone: '34988800006',
    loyalty: { consentGiven: true, consentDaysAgo: 45 },
  },
  {
    key: 'gabriela',
    username: 'gabriela.matos',
    name: 'Gabriela Matos',
    phone: '34988800007',
    loyalty: { consentGiven: true, consentDaysAgo: 30 },
  },
  // No loyalty account at all: orders must still work, just earn nothing.
  { key: 'henrique', username: 'henrique.pires', name: 'Henrique Pires', phone: '34988800008' },
  {
    key: 'igor',
    username: 'igor.tavares',
    name: 'Igor Tavares',
    phone: '34988800009',
    isActive: false,
  },
];

export async function seedPeople(
  prisma: PrismaClient,
  catalog: Catalog,
  passwordHash: string,
): Promise<People> {
  const ids = {} as Record<PersonKey, string>;

  for (const member of STAFF) {
    const created = await prisma.user.upsert({
      where: { username: member.username },
      update: {},
      create: {
        id: seedId(`user:${member.key}`),
        username: member.username,
        name: member.name,
        email: `${member.username}@nexio.com`,
        passwordHash,
        role: member.role,
        isActive: member.isActive ?? true,
        businessUnits: {
          create: member.units.map((unit) => ({ businessUnitId: catalog.unitIds[unit] })),
        },
      },
    });
    ids[member.key] = created.id;
  }

  for (const customer of CUSTOMERS) {
    const created = await prisma.user.upsert({
      where: { username: customer.username },
      update: {},
      create: {
        id: seedId(`user:${customer.key}`),
        username: customer.username,
        name: customer.name,
        email: `${customer.username}@nomail.com`,
        phone: customer.phone,
        passwordHash,
        role: 'CUSTOMER',
        isActive: customer.isActive ?? true,
      },
    });
    ids[customer.key] = created.id;
  }

  const loyaltyAccountIds: Partial<Record<CustomerKey, string>> = {};
  const loyaltyConsent: Partial<Record<CustomerKey, boolean>> = {};
  for (const customer of CUSTOMERS) {
    if (!customer.loyalty) {
      continue;
    }

    // totalPoints opens at 0 here: the balance is set from the ledger once orders
    // and manual movements are written, so the two can never disagree.
    const account = await prisma.loyaltyAccount.upsert({
      where: { customerId: ids[customer.key] },
      update: {},
      create: {
        id: seedId(`loyalty-account:${customer.key}`),
        customerId: ids[customer.key],
        totalPoints: 0,
        consentGiven: customer.loyalty.consentGiven,
        consentDate: daysAgo(customer.loyalty.consentDaysAgo),
        consentRevokedAt:
          customer.loyalty.revokedDaysAgo === undefined
            ? null
            : daysAgo(customer.loyalty.revokedDaysAgo),
      },
    });
    loyaltyAccountIds[customer.key] = account.id;
    loyaltyConsent[customer.key] = customer.loyalty.consentGiven;
  }

  return { ids, loyaltyAccountIds, loyaltyConsent };
}
