<script setup lang="ts">
import type { TagWithArticles } from '@hoard/shared';
import ArticleCard from '~/components/ui/ArticleCard.vue';

const route = useRoute();
const config = useRuntimeConfig();
const slug = route.params.slug as string;

const { data, error } = await useFetch<TagWithArticles>(`${config.public.apiBase}/tags/${slug}/articles`);
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <p v-if="error" class="text-sm text-ink-light">Tag not found.</p>
    <div v-else-if="data">
      <h1 class="font-serif text-3xl font-bold text-ink">#{{ data.tag.name }}</h1>
      <p v-if="data.articles.length === 0" class="mt-6 text-sm text-ink-light">No published articles yet.</p>
      <div v-else class="mt-6">
        <ArticleCard v-for="article in data.articles" :key="article.id" :article="article" />
      </div>
    </div>
  </div>
</template>
