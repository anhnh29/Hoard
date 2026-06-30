<script setup lang="ts">
import ArticleCard from '~/components/ui/ArticleCard.vue';
import type { ArticleListItem } from '@hoard/shared';

const route = useRoute();
const { public: { apiBase } } = useRuntimeConfig();

const searchQuery = ref((route.query.q as string) ?? '');
const articles = ref<ArticleListItem[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function doSearch(q: string) {
  const trimmed = q.trim();
  if (!trimmed) {
    navigateTo('/');
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    articles.value = await $fetch<ArticleListItem[]>(
      `${apiBase}/search?q=${encodeURIComponent(trimmed)}`,
    );
  } catch {
    error.value = 'Search failed. Try again.';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (route.query.q) doSearch(route.query.q as string);
});

watch(
  () => route.query.q,
  (q) => {
    searchQuery.value = (q as string) ?? '';
    if (q) doSearch(q as string);
  },
);
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <form
      class="mb-8"
      @submit.prevent="navigateTo(`/search?q=${encodeURIComponent(searchQuery.trim())}`)"
    >
      <input
        v-model="searchQuery"
        type="search"
        placeholder="Search articles..."
        class="w-full rounded-md border border-border px-4 py-2 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none"
      />
    </form>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <p v-else-if="loading" class="text-sm text-ink-light">Searching...</p>

    <p
      v-else-if="articles.length === 0 && route.query.q"
      class="text-sm text-ink-light"
    >
      No results for "{{ route.query.q }}".
    </p>

    <div class="divide-y divide-border">
      <ArticleCard
        v-for="article in articles"
        :key="article.id"
        :article="article"
        class="py-8"
      />
    </div>
  </div>
</template>
