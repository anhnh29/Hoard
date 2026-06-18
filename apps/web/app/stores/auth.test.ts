import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('$fetch', vi.fn());
  });

  it('starts with no session', () => {
    const store = useAuthStore();
    expect(store.user).toBeNull();
    expect(store.accessToken).toBeNull();
  });

  it('setSession stores the user and access token', () => {
    const store = useAuthStore();
    store.setSession({ id: '1', email: 'a@b.com', username: 'alice', name: 'Alice' }, 'token123');
    expect(store.user?.username).toBe('alice');
    expect(store.accessToken).toBe('token123');
  });

  it('clearSession resets state', () => {
    const store = useAuthStore();
    store.setSession({ id: '1', email: 'a@b.com', username: 'alice', name: 'Alice' }, 'token123');
    store.clearSession();
    expect(store.user).toBeNull();
    expect(store.accessToken).toBeNull();
  });

  it('refreshAccessToken calls /auth/refresh and updates the stored token', async () => {
    const fetchMock = globalThis.$fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ accessToken: 'new-token' });
    const store = useAuthStore();

    const result = await store.refreshAccessToken('http://localhost:3001');

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3001/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    expect(result).toBe('new-token');
    expect(store.accessToken).toBe('new-token');
  });
});
