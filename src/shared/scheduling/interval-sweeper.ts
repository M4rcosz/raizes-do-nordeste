import { Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';

/**
 * Dependency-free periodic sweep (no @nestjs/schedule yet). Owns the whole timer
 * lifecycle so each concrete sweeper only says what one pass does.
 *
 * The timer is unref'd so it never keeps the process - or a Jest worker - alive,
 * and it is cleared on shutdown. A failing pass is logged and swallowed: a sweeper
 * that dies on one bad row is a silent outage, since the interval would stop and
 * the backlog would grow forever.
 *
 * Real cron/queue scheduling can replace this later without touching the use cases.
 */
export abstract class IntervalSweeper implements OnApplicationBootstrap, OnModuleDestroy {
  // Resolves to the concrete subclass name, so log lines name the real sweeper.
  protected readonly logger = new Logger(this.constructor.name);
  private timer?: NodeJS.Timeout;

  protected constructor(private readonly intervalMs: number) {}

  /** One pass. Returns how many rows it touched. */
  protected abstract sweepOnce(): Promise<number>;

  /** Log line for a pass that touched at least one row. */
  protected abstract describeSweep(count: number): string;

  /** Log line for a pass that threw. */
  protected abstract readonly failureMessage: string;

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async sweep(): Promise<void> {
    try {
      const count = await this.sweepOnce();
      if (count > 0) {
        this.logger.log(this.describeSweep(count));
      }
    } catch (err) {
      this.logger.error(this.failureMessage, err instanceof Error ? err.stack : String(err));
    }
  }
}
