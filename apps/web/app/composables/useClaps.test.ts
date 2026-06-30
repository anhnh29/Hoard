import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./useApi', () => ({ useApi: vi.fn() }));
import { useApi } from './useApi';
import { useClaps } from './useClaps';

describe('useClaps', () => {
  beforeEach(() => vi.clearAllMocks());

  it('load fetches clap status', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({ totalClaps: 5, userClaps: 2 });
    const { totalClaps, userClaps, load } = useClaps('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    expect(totalClaps.value).toBe(5);
    expect(userClaps.value).toBe(2);
  });

  it('clap() calls POST and updates state', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ totalClaps: 0, userClaps: 0 }) // load
      .mockResolvedValueOnce({ totalClaps: 1, userClaps: 1 }); // POST
    const { totalClaps, userClaps, load, clap } = useClaps('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    await clap();
    expect(totalClaps.value).toBe(1);
    expect(userClaps.value).toBe(1);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001', '/articles/my-article/claps', 'token', expect.any(Function),
      { method: 'POST', body: { count: 1 } },
    );
  });

  it('clap() is a no-op when userClaps is at cap (10)', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({ totalClaps: 50, userClaps: 10 });
    const { load, clap } = useClaps('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    vi.clearAllMocks();
    await clap();
    expect(useApi).not.toHaveBeenCalled();
  });
});
