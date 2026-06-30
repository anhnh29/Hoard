import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('$fetch', mockFetch);

import { useFeed } from './useFeed';

describe('useFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with empty state', () => {
    const { articles, nextCursor, loading, error } = useFeed('http://localhost:3001');
    expect(articles.value).toEqual([]);
    expect(nextCursor.value).toBeNull();
    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it('loadMore fetches /feed and appends articles', async () => {
    mockFetch.mockResolvedValue({
      articles: [{ id: 'a1', title: 'Hello' }],
      nextCursor: '2024-01-01T00:00:00.000Z',
    });
    const { articles, nextCursor, loadMore } = useFeed('http://localhost:3001');
    await loadMore();
    expect(articles.value).toHaveLength(1);
    expect(nextCursor.value).toBe('2024-01-01T00:00:00.000Z');
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3001/feed');
  });

  it('passes cursor as query param on subsequent loadMore calls and accumulates articles', async () => {
    mockFetch
      .mockResolvedValueOnce({ articles: [{ id: 'a1' }], nextCursor: '2024-01-01T00:00:00.000Z' })
      .mockResolvedValueOnce({ articles: [{ id: 'a2' }], nextCursor: null });
    const { articles, nextCursor, loadMore } = useFeed('http://localhost:3001');
    await loadMore();
    await loadMore();
    expect(articles.value).toHaveLength(2);
    expect(nextCursor.value).toBeNull();
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/feed?cursor=2024-01-01T00%3A00%3A00.000Z',
    );
  });

  it('sets error when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    const { error, loadMore } = useFeed('http://localhost:3001');
    await loadMore();
    expect(error.value).toBe('Failed to load articles.');
  });

  it('clears error on a successful loadMore after a failure', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ articles: [], nextCursor: null });
    const { error, loadMore } = useFeed('http://localhost:3001');
    await loadMore();
    expect(error.value).toBe('Failed to load articles.');
    await loadMore();
    expect(error.value).toBeNull();
  });
});
