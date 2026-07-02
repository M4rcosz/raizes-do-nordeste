import { describe, expect, it } from '@jest/globals';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports status ok', () => {
    expect(new HealthController().check().status).toBe('ok');
  });

  it('reports the process uptime as a number', () => {
    expect(typeof new HealthController().check().uptime).toBe('number');
  });
});
