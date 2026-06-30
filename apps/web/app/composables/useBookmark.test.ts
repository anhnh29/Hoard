import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./useApi', () => ({ useApi: vi.fn() }));
import { useApi } from './useApi';
import { useBookmark } from './useBookmark';

describe('useBookmark', () => {
  beforeEach(() => vi.clearAllMocks());

  it('load sets isBookmarked from API', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({ isBookmarked: true });
    const { isBookmarked, load } = useBookmark('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    expect(isBookmarked.value).toBe(true);
    expect(useApi).toHaveBeenCalledWith('http://localhost:3001', '/bookmarks/my-article/status', 'token', expect.any(Function));
  });

  it('toggle calls POST when not bookmarked', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ isBookmarked: false }) // load
      .mockResolvedValueOnce({ isBookmarked: true }); // POST
    const { isBookmarked, load, toggle } = useBookmark('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    await toggle();
    expect(isBookmarked.value).toBe(true);
    expect(useApi).toHaveBeenCalledWith(
      'http://localhost:3001', '/bookmarks/my-article', 'token', expect.any(Function), { method: 'POST' },
    );
  });

  it('toggle calls DELETE when already bookmarked', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ isBookmarked: true })
      .mockResolvedValueOnce(undefined);
    const { isBookmarked, load, toggle } = useBookmark('http://localhost:3001', 'my-article', 'token', vi.fn());
    await load();
    await toggle();
    expect(isBookmarked.value).toBe(false);
  });
});
