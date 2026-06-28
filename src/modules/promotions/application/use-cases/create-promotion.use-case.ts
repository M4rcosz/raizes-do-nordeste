import { Inject, Injectable } from '@nestjs/common';
import { BusinessUnitScopeError } from '@shared/errors/application/business-unit-scope.error';
import { Promotion } from '../../domain/entities/promotion.entity';
import {
  type CreatePromotionInput,
  PROMOTION_REPOSITORY,
  type PromotionRepository,
} from '../../domain/repositories/promotion.repository';
import { PromotionNotEligibleError } from '../../domain/errors/promotion-not-eligible.error';
import type { PromotionActor } from '../promotion-actor';

/** The create payload minus the unit, which comes from the actor, not the body. */
export type CreatePromotionDraft = Omit<CreatePromotionInput, 'businessUnitId'>;

@Injectable()
export class CreatePromotionUseCase {
  constructor(
    @Inject(PROMOTION_REPOSITORY)
    private readonly promotions: PromotionRepository,
  ) {}

  async execute(draft: CreatePromotionDraft, actor: PromotionActor): Promise<Promotion> {
    // The unit is taken from the actor's claim, never the body. A global (null)
    // ADMIN has no concrete unit to create in, so reject as not-found; staff with
    // a null scope never reaches here (the guard stops it first).
    if (actor.businessUnitId === null) {
      throw new BusinessUnitScopeError();
    }

    // A window that ends at or before it starts can never be eligible. Reject at the
    // door (422) so we never persist a promotion that is dead on arrival. DTO validation
    // does not see across two fields, so this invariant lives here.
    if (draft.endDate.getTime() <= draft.startDate.getTime()) {
      throw new PromotionNotEligibleError(
        `Promotion endDate (${draft.endDate.toISOString()}) must be after startDate (${draft.startDate.toISOString()}).`,
      );
    }

    return this.promotions.create({ ...draft, businessUnitId: actor.businessUnitId });
  }
}
