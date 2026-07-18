import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type { ToolDeclaration } from '../ports/chat-model.port';

export const FIND_ORDER_BY_ID = 'findOrderById';
export const GET_MY_LOYALTY = 'getMyLoyalty';
export const LIST_ORDERS = 'listOrders';
export const LIST_USERS = 'listUsers';
export const LIST_BUSINESS_UNITS = 'listBusinessUnits';
export const LIST_CATEGORIES = 'listCategories';
export const LIST_MENU_ITEMS = 'listMenuItems';
export const LIST_PROMOTIONS = 'listPromotions';
export const LIST_INVENTORY = 'listInventory';

const STAFF: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT, UserRole.KITCHEN];
const EVERYONE: UserRole[] = [...STAFF, UserRole.CUSTOMER];

/**
 * One tool the model may be offered: its declaration plus the roles allowed to use
 * it. `roles` drives two separate things - which declarations a given actor is shown
 * (token economy: an actor never pays for a tool they cannot use) and whether a
 * dispatch is allowed to run (the actual gate). Keeping both off one table means the
 * two can never drift apart.
 */
export interface ToolSpec {
  declaration: ToolDeclaration;
  roles: UserRole[];
}

// Repeated in several list tools: the unit whose data is being asked about.
const businessUnitIdArg = {
  type: 'string',
  format: 'uuid',
  description: 'The id of the business unit. Call listBusinessUnits first if you do not have it.',
};

export const TOOL_SPECS: ToolSpec[] = [
  {
    roles: EVERYONE,
    declaration: {
      name: FIND_ORDER_BY_ID,
      description:
        'Look up one order by its id and return its status, channel, total, and line items. Only returns orders the current user is allowed to see.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          orderId: {
            type: 'string',
            format: 'uuid',
            description: 'The id of the order to look up.',
          },
        },
        required: ['orderId'],
      },
    },
  },
  {
    roles: [UserRole.CUSTOMER],
    declaration: {
      name: GET_MY_LOYALTY,
      description:
        "Return the current user's own loyalty account: points balance, consent status, and enrollment date.",
      parametersJsonSchema: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    roles: EVERYONE,
    declaration: {
      name: LIST_ORDERS,
      description:
        'List orders visible to the current user, newest first. A customer gets only their own orders; staff get orders from the units they work at. Returns at most 10 orders; if hasMore is true, ask the user to narrow the question instead of trying to page.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          businessUnitId: {
            type: 'string',
            format: 'uuid',
            description: 'Only orders from this unit. Ignored for customers.',
          },
          orderStatus: {
            type: 'string',
            enum: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'],
            description: 'Only orders in this status.',
          },
          orderChannel: {
            type: 'string',
            enum: ['APP', 'WEB', 'TOTEM', 'COUNTER', 'PICKUP'],
            description: 'Only orders placed through this channel.',
          },
          createdAtFrom: {
            type: 'string',
            format: 'date-time',
            description: 'Only orders created at or after this ISO-8601 instant.',
          },
          createdAtTo: {
            type: 'string',
            format: 'date-time',
            description: 'Only orders created at or before this ISO-8601 instant.',
          },
        },
      },
    },
  },
  {
    roles: [UserRole.ADMIN],
    declaration: {
      name: LIST_USERS,
      description:
        'List platform users with their role and status. Returns at most 10 users; if hasMore is true, ask for a narrower search rather than paging. Contact details are never available through this tool.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            description: 'Only users whose username contains this text (case-insensitive).',
          },
          businessUnitId: {
            type: 'string',
            format: 'uuid',
            description: 'Only users assigned to this unit.',
          },
        },
      },
    },
  },
  {
    roles: EVERYONE,
    declaration: {
      name: LIST_BUSINESS_UNITS,
      description:
        'List the active restaurant units with their address, city, and phone. Use this to resolve a unit name the user mentioned into the id other tools need. Returns at most 10 units.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Only units whose name contains this text (case-insensitive).',
          },
        },
      },
    },
  },
  {
    roles: EVERYONE,
    declaration: {
      name: LIST_CATEGORIES,
      description:
        'List the active product categories on the menu (e.g. drinks, mains). Returns at most 10 categories.',
      parametersJsonSchema: {
        type: 'object',
        properties: {
          search: {
            type: 'string',
            description: 'Only categories whose name contains this text (case-insensitive).',
          },
        },
      },
    },
  },
  {
    roles: EVERYONE,
    declaration: {
      name: LIST_MENU_ITEMS,
      description:
        "List the items currently available on one unit's menu, with their price at that unit. Only available items are returned. Returns at most 10 items; if hasMore is true, say the menu is longer rather than implying it is the whole menu.",
      parametersJsonSchema: {
        type: 'object',
        properties: { businessUnitId: businessUnitIdArg },
        required: ['businessUnitId'],
      },
    },
  },
  {
    // Matches GET /api/promotions/by-business-unit/:id (ADMIN, MANAGER). The AI
    // channel must not be the more permissive door: widening here without widening
    // the route would make the assistant a role-gate bypass.
    roles: [UserRole.ADMIN, UserRole.MANAGER],
    declaration: {
      name: LIST_PROMOTIONS,
      description:
        "List one unit's promotions, including inactive and expired ones, with their discount and validity window. Returns at most 10 promotions.",
      parametersJsonSchema: {
        type: 'object',
        properties: { businessUnitId: businessUnitIdArg },
        required: ['businessUnitId'],
      },
    },
  },
  {
    // Matches INVENTORY_ROLES on GET /api/inventory/:businessUnitId (ADMIN, MANAGER).
    // KITCHEN plausibly wants stock, but that is a product decision to make on the
    // route first - see the note on LIST_PROMOTIONS.
    roles: [UserRole.ADMIN, UserRole.MANAGER],
    declaration: {
      name: LIST_INVENTORY,
      description:
        'List stock levels at one unit: quantity, the replenishment threshold, and whether the item is at or below it (isLowStock). Returns at most 10 products; if hasMore is true, say so rather than implying it is the whole stock list.',
      parametersJsonSchema: {
        type: 'object',
        properties: { businessUnitId: businessUnitIdArg },
        required: ['businessUnitId'],
      },
    },
  },
];

/** The spec for a tool name, or undefined when the model named a tool we do not have. */
export function findToolSpec(name: string): ToolSpec | undefined {
  return TOOL_SPECS.find((spec) => spec.declaration.name === name);
}

/** Whether a role may use a tool. Unknown tool names are always denied. */
export function isToolAllowedFor(name: string, role: UserRole): boolean {
  return findToolSpec(name)?.roles.includes(role) ?? false;
}
