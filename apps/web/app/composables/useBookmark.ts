import { ref } from 'vue';
import type { BookmarkStatus } from '@hoard/shared';
import { useApi } from './useApi';

export function useBookmark(
  apiBase: string,
  slug: string,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
) {
  const isBookmarked = ref(false);
  const loading = ref(false);

  async function load() {
    try {
      const data = await useApi<BookmarkStatus>(apiBase, `/bookmarks/${slug}/status`, accessToken, onRefresh);
      isBookmarked.value = data.isBookmarked;
    } catch {
      // keep default false
    }
  }

  async function toggle() {
    if (loading.value) return;
    loading.value = true;
    const was = isBookmarked.value;
    isBookmarked.value = !was;
    try {
      if (was) {
        await useApi<void>(apiBase, `/bookmarks/${slug}`, accessToken, onRefresh, { method: 'DELETE' });
      } else {
        await useApi<BookmarkStatus>(apiBase, `/bookmarks/${slug}`, accessToken, onRefresh, { method: 'POST' });
      }
    } catch {
      isBookmarked.value = was;
    } finally {
      loading.value = false;
    }
  }

  return { isBookmarked, loading, load, toggle };
}
