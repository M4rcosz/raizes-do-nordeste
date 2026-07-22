import { beforeEach, describe, expect, it } from '@jest/globals';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { Inventory } from '@modules/inventory/domain/entities/inventory.entity';
import type {
  FindInventoryByUnitInput,
  InventoryRepository,
} from '@modules/inventory/domain/repositories/inventory.repository';
import { InventoryForAiService } from './inventory-for-ai.service';
import type { InventoryAiActor } from '../ports/inventory-for-ai.port';

function inventory(id: string, quantity: number, minQuantity: number): Inventory {
  return new Inventory(id, 'bu-1', `product-${id}`, quantity, minQuantity, new Date(), new Date());
}

class RecordingInventoryRepository implements Pick<InventoryRepository, 'findManyByUnit'> {
  lastInput?: FindInventoryByUnitInput;
  rows: Inventory[] = [];

  findManyByUnit(input: FindInventoryByUnitInput): Promise<Inventory[]> {
    this.lastInput = input;
    return Promise.resolve(this.rows);
  }
}

const manager: InventoryAiActor = {
  userId: 'manager-1',
  role: UserRole.MANAGER,
  businessUnitIds: ['bu-1'],
};

const admin: InventoryAiActor = { userId: 'admin-1', role: UserRole.ADMIN, businessUnitIds: [] };

describe('InventoryForAiService.listForActor', () => {
  let repo: RecordingInventoryRepository;
  let service: InventoryForAiService;

  beforeEach(() => {
    repo = new RecordingInventoryRepository();
    service = new InventoryForAiService(repo as unknown as InventoryRepository);
  });

  describe('unit scope', () => {
    it('reads a unit in the actor claim', async () => {
      repo.rows = [inventory('1', 10, 5)];

      const result = await service.listForActor('bu-1', manager);

      expect(repo.lastInput?.businessUnitId).toBe('bu-1');
      expect(result.inventory).toHaveLength(1);
    });

    it('returns empty for a unit outside the claim, without querying', async () => {
      // Empty rather than an error: an error would confirm the unit exists, and the
      // model would relay that to the user.
      const result = await service.listForActor('bu-9', manager);

      expect(result).toEqual({ inventory: [], hasMore: false });
      expect(repo.lastInput).toBeUndefined();
    });

    it('lets an admin read any unit despite an empty claim', async () => {
      repo.rows = [inventory('1', 10, 5)];

      const result = await service.listForActor('bu-9', admin);

      expect(repo.lastInput?.businessUnitId).toBe('bu-9');
      expect(result.inventory).toHaveLength(1);
    });
  });

  describe('view', () => {
    it('reports low stock on the domain rule (at or below the threshold)', async () => {
      // Inventory.isLowStock() is <=, not <. Recomputing it here with < would tell
      // staff a product is fine while the system raises a STOCK_ALERT on it.
      repo.rows = [inventory('at', 5, 5), inventory('below', 4, 5), inventory('above', 6, 5)];

      const result = await service.listForActor('bu-1', manager);

      expect(result.inventory.map((i) => i.isLowStock)).toEqual([true, true, false]);
    });
  });

  describe('capping', () => {
    it('over-fetches by one and reports hasMore without leaking the probe row', async () => {
      repo.rows = Array.from({ length: 11 }, (_, i) => inventory(String(i), 1, 1));

      const result = await service.listForActor('bu-1', manager);

      expect(repo.lastInput?.take).toBe(11);
      expect(result.inventory).toHaveLength(10);
      expect(result.hasMore).toBe(true);
    });
  });
});
