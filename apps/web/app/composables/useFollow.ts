import { ref } from 'vue';
import type { FollowStatus } from '@hoard/shared';
import { useApi } from './useApi';

export function useFollow(
  apiBase: string,
  username: string,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
) {
  const isFollowing = ref(false);
  const loading = ref(false);

  async function load() {
    try {
      const data = await useApi<FollowStatus>(apiBase, `/follows/${username}/status`, accessToken, onRefresh);
      isFollowing.value = data.isFollowing;
    } catch {
      // keep default false
    }
  }

  async function toggle() {
    if (loading.value) return;
    loading.value = true;
    const was = isFollowing.value;
    isFollowing.value = !was;
    try {
      if (was) {
        await useApi<void>(apiBase, `/follows/${username}`, accessToken, onRefresh, { method: 'DELETE' });
      } else {
        await useApi<FollowStatus>(apiBase, `/follows/${username}`, accessToken, onRefresh, { method: 'POST' });
      }
    } catch {
      isFollowing.value = was;
    } finally {
      loading.value = false;
    }
  }

  return { isFollowing, loading, load, toggle };
}
