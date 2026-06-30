<script setup lang="ts">
import ArticleCard from '~/components/ui/ArticleCard.vue';
import { useFeed } from '~/composables/useFeed';

const { public: { apiBase } } = useRuntimeConfig();
const { articles, nextCursor, loading, error, loadMore } = useFeed(apiBase);

onMounted(loadMore);
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <h1 class="mb-8 font-serif text-3xl font-bold text-ink">Explore</h1>

    <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

    <p v-else-if="articles.length === 0 && !loading" class="text-sm text-ink-light">
      No articles yet.
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
