import { Inject, Injectable } from '@nestjs/common';
import { BusinessUnitScopeError } from '@shared/errors/application/business-unit-scope.error';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  type CreatePromotionInput,
  PROMOTION_REPOSITORY,
  type PromotionRepository,
} from '../../domain/repositories/promotion.repository';
import { PromotionNotEligibleError } from '../../domain/errors/promotion-not-eligible.error';
import { FreeItemNotSupportedError } from '../../domain/errors/free-item-not-supported.error';
import { DiscountType } from '../../domain/value-objects/discount-type';
import { actorOwnsUnit, type PromotionActor } from '../promotion-actor';

/** The full create payload. The target unit is now an explicit field of the body. */
export type CreatePromotionDraft = CreatePromotionInput;

@Injectable()
export class CreatePromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
  ) {}

  async execute(draft: CreatePromotionDraft, actor: PromotionActor): Promise<Promotion> {
    // The unit comes from the body, but the actor must be scoped to it. ADMIN
    // reaches any unit; a non-admin asking for a unit outside their claim reads
    // as not-found so a foreign unit never leaks its existence.
    if (!actorOwnsUnit(actor, draft.businessUnitId)) {
      throw new BusinessUnitScopeError();
    }

    // FREE_ITEM can never be priced (no target-item column), so a persisted one is an
    // offer that throws the moment a customer acts on it - and the public listing would
    // advertise it. Reject at the write border instead of at order time.
    if (draft.discountType === DiscountType.FREE_ITEM) {
      throw new FreeItemNotSupportedError(
        'FREE_ITEM promotions are not supported: the schema does not model a target item.',
      );
    }

    // A window that ends at or before it starts can never be eligible. Reject at the
    // door (422) so we never persist a promotion that is dead on arrival. DTO validation
    // does not see across two fields, so this invariant lives here.
    if (draft.endDate.getTime() <= draft.startDate.getTime()) {
      throw new PromotionNotEligibleError(
        `Promotion endDate (${draft.endDate.toISOString()}) must be after startDate (${draft.startDate.toISOString()}).`,
      );
    }

    return this.promotions.create(draft);
  }
}
