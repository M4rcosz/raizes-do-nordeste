import { Injectable } from '@nestjs/common';
import { IntervalSweeper } from '@shared/scheduling/interval-sweeper';
import { ExpireLoyaltyPointsUseCase } from '../../application/use-cases/expire-loyalty-points.use-case';

/** How often the expiry sweep runs. Points live ~12 months, so a daily pass is ample. */
export const LOYALTY_EXPIRY_SWEEP_INTERVAL_MS = 24 * 60 * 60_000;

/** Expires loyalty points past their window. */
@Injectable()
export class LoyaltyExpirySweeper extends IntervalSweeper {
  protected readonly failureMessage = 'Loyalty expiry sweep failed';

  constructor(private readonly expirePoints: ExpireLoyaltyPointsUseCase) {
    super(LOYALTY_EXPIRY_SWEEP_INTERVAL_MS);
  }

  protected sweepOnce(): Promise<number> {
    return this.expirePoints.execute();
  }

  protected describeSweep(count: number): string {
    return `Expired ${count} loyalty point(s) past their window.`;
  }
}
