import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useApi } from './useApi';

describe('useApi', () => {
  beforeEach(() => {
    vi.stubGlobal('$fetch', vi.fn());
  });

  it('attaches the access token and returns the response on success', async () => {
    const fetchMock = globalThis.$fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true });

    const result = await useApi('http://localhost:3001', '/auth/me', 'token-1', async () => 'token-2');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/auth/me',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer token-1' }),
      }),
    );
  });

  it('refreshes once and retries on a 401, then succeeds', async () => {
    const fetchMock = globalThis.$fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValueOnce({ statusCode: 401 }).mockResolvedValueOnce({ ok: true });
    const onRefresh = vi.fn().mockResolvedValue('token-2');

    const result = await useApi('http://localhost:3001', '/auth/me', 'token-1', onRefresh);

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:3001/auth/me',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-2' }) }),
    );
  });

  it('rethrows non-401 errors without attempting a refresh', async () => {
    const fetchMock = globalThis.$fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue({ statusCode: 500 });
    const onRefresh = vi.fn();

    await expect(useApi('http://localhost:3001', '/auth/me', 'token-1', onRefresh)).rejects.toEqual({
      statusCode: 500,
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
