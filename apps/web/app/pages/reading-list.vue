<script setup lang="ts">
import type { ArticleListItem, PaginatedArticles } from '@hoard/shared';
import ArticleCard from '~/components/ui/ArticleCard.vue';
import { useApi } from '~/composables/useApi';

definePageMeta({ middleware: 'auth' });

const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const articles = ref<ArticleListItem[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(false);

async function loadMore() {
  loading.value = true;
  try {
    const path = nextCursor.value
      ? `/bookmarks?cursor=${encodeURIComponent(nextCursor.value)}`
      : '/bookmarks';
    const data = await useApi<PaginatedArticles>(
      apiBase, path, auth.accessToken, () => auth.refreshAccessToken(),
    );
    articles.value.push(...data.articles);
    nextCursor.value = data.nextCursor;
  } finally {
    loading.value = false;
  }
}

onMounted(loadMore);
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <h1 class="mb-8 font-serif text-3xl font-bold text-ink">Reading list</h1>

    <p v-if="articles.length === 0 && !loading" class="text-sm text-ink-light">
      Your reading list is empty.
    </p>

    <div class="divide-y divide-border">
      <ArticleCard v-for="article in articles" :key="article.id" :article="article" class="py-8" />
    </div>

    <div class="mt-8 text-center">
      <p v-if="loading" class="text-sm text-ink-light">Loading...</p>
      <button
        v-else-if="nextCursor"
        class="rounded-full border border-border px-6 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent"
        @click="loadMore"
      >
        Load more
      </button>
    </div>
  </div>
</template>
