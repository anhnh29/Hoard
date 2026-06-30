import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./useApi', () => ({ useApi: vi.fn() }));
import { useApi } from './useApi';
import { useFollowingFeed } from './useFollowingFeed';

describe('useFollowingFeed', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts with empty state', () => {
    const { articles, nextCursor, loading } = useFollowingFeed('http://localhost:3001', 'token', vi.fn());
    expect(articles.value).toEqual([]);
    expect(nextCursor.value).toBeNull();
    expect(loading.value).toBe(false);
  });

  it('loadMore calls /feed/following and appends articles', async () => {
    (useApi as ReturnType<typeof vi.fn>).mockResolvedValue({
      articles: [{ id: 'a1' }],
      nextCursor: '2024-01-01T00:00:00.000Z',
    });
    const { articles, nextCursor, loadMore } = useFollowingFeed('http://localhost:3001', 'token', vi.fn());
    await loadMore();
    expect(articles.value).toHaveLength(1);
    expect(nextCursor.value).toBe('2024-01-01T00:00:00.000Z');
    expect(useApi).toHaveBeenCalledWith('http://localhost:3001', '/feed/following', 'token', expect.any(Function));
  });

  it('passes cursor on subsequent loadMore calls', async () => {
    (useApi as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ articles: [{ id: 'a1' }], nextCursor: '2024-01-01T00:00:00.000Z' })
      .mockResolvedValueOnce({ articles: [{ id: 'a2' }], nextCursor: null });
    const { articles, nextCursor, loadMore } = useFollowingFeed('http://localhost:3001', 'tok', vi.fn());
    await loadMore();
    await loadMore();
    expect(articles.value).toHaveLength(2);
    expect(nextCursor.value).toBeNull();
    expect(useApi).toHaveBeenNthCalledWith(
      2, 'http://localhost:3001',
      '/feed/following?cursor=2024-01-01T00%3A00%3A00.000Z', 'tok', expect.any(Function),
    );
  });
});
