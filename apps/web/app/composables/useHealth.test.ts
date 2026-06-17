import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useHealth } from './useHealth';

describe('useHealth', () => {
  beforeEach(() => {
    vi.stubGlobal('$fetch', vi.fn());
  });

  it('returns the health status on success', async () => {
    (globalThis.$fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: 'ok',
      dbConnected: true,
    });

    const { data, error } = await useHealth('http://localhost:3001');

    expect(data.value).toEqual({ status: 'ok', dbConnected: true });
    expect(error.value).toBeNull();
  });

  it('captures an error when the fetch fails', async () => {
    (globalThis.$fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    const { data, error } = await useHealth('http://localhost:3001');

    expect(data.value).toBeNull();
    expect(error.value).toBeInstanceOf(Error);
  });
});
