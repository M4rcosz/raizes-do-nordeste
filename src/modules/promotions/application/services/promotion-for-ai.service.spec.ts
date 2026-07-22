import { beforeEach, describe, expect, it } from '@jest/globals';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { Money } from '@shared/domain/value-objects/money';
import { Promotion } from '@modules/promotions/domain/entities/promotion.entity';
import { DiscountType } from '@modules/promotions/domain/value-objects/discount-type';
import type {
  FindPromotionsByBusinessUnitInput,
  PromotionRepository,
} from '@modules/promotions/domain/repositories/promotion.repository';
import { PromotionForAiService } from './promotion-for-ai.service';
import type { PromotionAiActor } from '../ports/promotion-for-ai.port';

function promotion(id: string): Promotion {
  return new Promotion(
    id,
    'bu-1',
    'Terca do Baiao',
    DiscountType.PERCENTAGE,
    Money.fromDecimalString('10.00'),
    Money.fromDecimalString('30.00'),
    new Date('2026-01-01T00:00:00.000Z'),
    new Date('2026-12-31T00:00:00.000Z'),
    true,
    new Date(),
    new Date(),
  );
}

class RecordingPromotionRepository implements Pick<PromotionRepository, 'findManyByBusinessUnit'> {
  lastInput?: FindPromotionsByBusinessUnitInput;
  rows: Promotion[] = [];

  findManyByBusinessUnit(input: FindPromotionsByBusinessUnitInput): Promise<Promotion[]> {
    this.lastInput = input;
    return Promise.resolve(this.rows);
  }
}

const manager: PromotionAiActor = {
  userId: 'manager-1',
  role: UserRole.MANAGER,
  businessUnitIds: ['bu-1'],
};

const admin: PromotionAiActor = { userId: 'admin-1', role: UserRole.ADMIN, businessUnitIds: [] };

describe('PromotionForAiService.listForActor', () => {
  let repo: RecordingPromotionRepository;
  let service: PromotionForAiService;

  beforeEach(() => {
    repo = new RecordingPromotionRepository();
    service = new PromotionForAiService(repo as unknown as PromotionRepository);
  });

  describe('unit scope', () => {
    it('reads a unit in the actor claim', async () => {
      repo.rows = [promotion('promo-1')];

      const result = await service.listForActor('bu-1', manager);

      expect(repo.lastInput?.businessUnitId).toBe('bu-1');
      expect(result.promotions).toHaveLength(1);
    });

    it('returns empty for a unit outside the claim, without querying', async () => {
      const result = await service.listForActor('bu-9', manager);

      expect(result).toEqual({ promotions: [], hasMore: false });
      expect(repo.lastInput).toBeUndefined();
    });

    it('lets an admin read any unit despite an empty claim', async () => {
      repo.rows = [promotion('promo-1')];

      const result = await service.listForActor('bu-9', admin);

      expect(repo.lastInput?.businessUnitId).toBe('bu-9');
      expect(result.promotions).toHaveLength(1);
    });
  });

  it('maps money to decimal strings and dates to ISO, never numbers', async () => {
    repo.rows = [promotion('promo-1')];

    const [view] = (await service.listForActor('bu-1', manager)).promotions;

    expect(view).toMatchObject({
      discountValue: '10.00',
      minOrderValue: '30.00',
      startDate: '2026-01-01T00:00:00.000Z',
      discountType: DiscountType.PERCENTAGE,
    });
  });

  it('over-fetches by one and reports hasMore without leaking the probe row', async () => {
    repo.rows = Array.from({ length: 11 }, (_, i) => promotion(`promo-${i}`));

    const result = await service.listForActor('bu-1', manager);

    expect(repo.lastInput?.take).toBe(11);
    expect(result.promotions).toHaveLength(10);
    expect(result.hasMore).toBe(true);
  });
});
