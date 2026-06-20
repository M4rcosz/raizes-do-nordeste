import { describe, expect, it } from '@jest/globals';
import { detectClient } from './client-detection';

describe('detectClient', () => {
  it('detects Postman from PostmanRuntime', () => {
    const result = detectClient('PostmanRuntime/7.39.0');
    expect(result.client).toBe('postman');
    expect(result.raw).toBe('PostmanRuntime/7.39.0');
  });

  it('detects curl', () => {
    expect(detectClient('curl/8.7.1').client).toBe('curl');
  });

  it('detects insomnia', () => {
    expect(detectClient('insomnia/9.3.2').client).toBe('insomnia');
  });

  it('detects a desktop browser', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    expect(detectClient(chrome).client).toBe('browser');
  });

  it('returns unknown for an empty string', () => {
    const result = detectClient('');
    expect(result.client).toBe('unknown');
    expect(result.raw).toBe('');
  });

  it('returns unknown for undefined', () => {
    const result = detectClient(undefined);
    expect(result.client).toBe('unknown');
    expect(result.raw).toBe('');
  });

  it('returns unknown for an unrecognized agent', () => {
    expect(detectClient('SomeRandomBot/1.0').client).toBe('unknown');
  });
});
