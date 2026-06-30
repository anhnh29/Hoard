import { ref } from 'vue';
import type { ArticleListItem, PaginatedArticles } from '@hoard/shared';
import { useApi } from './useApi';

export function useFollowingFeed(
  apiBase: string,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
) {
  const articles = ref<ArticleListItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadMore() {
    loading.value = true;
    error.value = null;
    try {
      const path = nextCursor.value
        ? `/feed/following?cursor=${encodeURIComponent(nextCursor.value)}`
        : '/feed/following';
      const data = await useApi<PaginatedArticles>(apiBase, path, accessToken, onRefresh);
      articles.value.push(...data.articles);
      nextCursor.value = data.nextCursor;
    } catch {
      error.value = 'Failed to load articles.';
    } finally {
      loading.value = false;
    }
  }

  return { articles, nextCursor, loading, error, loadMore };
}
