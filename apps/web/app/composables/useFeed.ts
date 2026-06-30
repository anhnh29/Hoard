import { ref } from 'vue';
import type { ArticleListItem, PaginatedArticles } from '@hoard/shared';

export function useFeed(apiBase: string) {
  const articles = ref<ArticleListItem[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function loadMore() {
    loading.value = true;
    error.value = null;
    try {
      const url = nextCursor.value
        ? `${apiBase}/feed?cursor=${encodeURIComponent(nextCursor.value)}`
        : `${apiBase}/feed`;
      const data = await $fetch<PaginatedArticles>(url);
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
