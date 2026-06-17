import { describe, it, expect } from 'vitest';
import { isHealthStatus } from './health';

describe('isHealthStatus', () => {
  it('accepts a valid health status object', () => {
    expect(isHealthStatus({ status: 'ok', dbConnected: true })).toBe(true);
  });

  it('rejects an object missing dbConnected', () => {
    expect(isHealthStatus({ status: 'ok' })).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isHealthStatus(null)).toBe(false);
  });
});
