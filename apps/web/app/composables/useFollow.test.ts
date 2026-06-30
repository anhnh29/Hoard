import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./useApi', () => ({ useApi: vi.fn() }));
import { useApi } from './useApi';
import { useFollow } from './useFollow';

describe('useFollow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('load sets isFollowing from API response', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({ isFollowing: true });
    const { isFollowing, load } = useFollow('http://localhost:3001', 'alice', 'token', vi.fn());
    await load();
    expect(isFollowing.value).toBe(true);
    expect(useApi).toHaveBeenCalledWith('http://localhost:3001', '/follows/alice/status', 'token', expect.any(Function));
  });

  it('toggle calls POST and flips isFollowing from false to true', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ isFollowing: false }) // load
      .mockResolvedValueOnce({ isFollowing: true }); // POST
    const { isFollowing, load, toggle } = useFollow('http://localhost:3001', 'alice', 'token', vi.fn());
    await load();
    await toggle();
    expect(isFollowing.value).toBe(true);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001', '/follows/alice', 'token', expect.any(Function),
      { method: 'POST' },
    );
  });

  it('toggle calls DELETE when already following', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ isFollowing: true }) // load
      .mockResolvedValueOnce(undefined); // DELETE
    const { isFollowing, load, toggle } = useFollow('http://localhost:3001', 'alice', 'token', vi.fn());
    await load();
    await toggle();
    expect(isFollowing.value).toBe(false);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001', '/follows/alice', 'token', expect.any(Function),
      { method: 'DELETE' },
    );
  });
});
