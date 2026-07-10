import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { IntervalSweeper } from './interval-sweeper';

const INTERVAL_MS = 5 * 60_000;

// A concrete sweeper standing in for the four real ones. The timer lifecycle and the
// swallow-and-log policy live entirely in the base, so exercising them here covers
// every sweeper; each concrete subclass only declares what one pass does.
class TestSweeper extends IntervalSweeper {
  protected readonly failureMessage = 'Test sweep failed';

  constructor(private readonly run: () => Promise<number>) {
    super(INTERVAL_MS);
  }

  protected sweepOnce(): Promise<number> {
    return this.run();
  }

  protected describeSweep(count: number): string {
    return `Swept ${count} row(s).`;
  }
}

describe('IntervalSweeper', () => {
  let run: jest.MockedFunction<() => Promise<number>>;
  let sweeper: TestSweeper;

  beforeEach(() => {
    run = jest.fn<() => Promise<number>>().mockResolvedValue(0);
    sweeper = new TestSweeper(run);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('scheduling', () => {
    // The unref is not decoration: without it the interval keeps the Node process,
    // and every Jest worker, alive after the suite finishes.
    it('schedules on the subclass interval and unrefs the timer', () => {
      const timer = { unref: jest.fn() } as unknown as NodeJS.Timeout;
      const setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue(timer);

      sweeper.onApplicationBootstrap();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), INTERVAL_MS);
      expect(timer.unref).toHaveBeenCalledTimes(1);
    });

    it('clears the interval on shutdown', () => {
      const timer = { unref: jest.fn() } as unknown as NodeJS.Timeout;
      jest.spyOn(global, 'setInterval').mockReturnValue(timer);
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      sweeper.onApplicationBootstrap();
      sweeper.onModuleDestroy();

      expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
    });

    it('is a no-op on shutdown when it never booted', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      expect(() => sweeper.onModuleDestroy()).not.toThrow();
      expect(clearIntervalSpy).not.toHaveBeenCalled();
    });

    // Otherwise every sweeper would log under the base class name.
    it('names its logger after the concrete subclass', () => {
      const logger = (sweeper as unknown as { logger: { context?: string } }).logger;

      expect(logger.context).toBe('TestSweeper');
    });
  });

  describe('sweeping', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('does not run the sweep before the first interval elapses', async () => {
      sweeper.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(INTERVAL_MS - 1);

      expect(run).not.toHaveBeenCalled();
    });

    it('runs one pass on every interval', async () => {
      sweeper.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(INTERVAL_MS * 3);

      expect(run).toHaveBeenCalledTimes(3);
    });

    it('logs only when the pass touched at least one row', async () => {
      const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      run.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
      sweeper.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(INTERVAL_MS);
      expect(log).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(INTERVAL_MS);
      expect(log).toHaveBeenCalledWith('Swept 2 row(s).');
    });

    // A sweeper that dies on one bad row is a silent outage: the interval would stop
    // and the backlog would grow forever. The failure must be logged and absorbed.
    it('swallows and logs a failing pass, and keeps sweeping afterwards', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const boom = new Error('db down');
      run.mockRejectedValueOnce(boom).mockResolvedValueOnce(1);
      sweeper.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(INTERVAL_MS);
      expect(error).toHaveBeenCalledWith('Test sweep failed', boom.stack);

      await jest.advanceTimersByTimeAsync(INTERVAL_MS);
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('stringifies a non-Error rejection rather than logging undefined', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      run.mockRejectedValueOnce('just a string');
      sweeper.onApplicationBootstrap();

      await jest.advanceTimersByTimeAsync(INTERVAL_MS);

      expect(error).toHaveBeenCalledWith('Test sweep failed', 'just a string');
    });

    it('stops sweeping once destroyed', async () => {
      sweeper.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(INTERVAL_MS);
      sweeper.onModuleDestroy();

      await jest.advanceTimersByTimeAsync(INTERVAL_MS * 5);

      expect(run).toHaveBeenCalledTimes(1);
    });
  });
});
