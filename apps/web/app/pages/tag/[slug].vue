<script setup lang="ts">
import type { TagWithArticles } from '@hoard/shared';

const route = useRoute();
const config = useRuntimeConfig();
const slug = route.params.slug as string;

const { data, error } = await useFetch<TagWithArticles>(`${config.public.apiBase}/tags/${slug}/articles`);
</script>

<template>
  <div>
    <p v-if="error">Tag not found.</p>
    <div v-else-if="data">
      <h1>#{{ data.tag.name }}</h1>
      <p v-if="data.articles.length === 0">No published articles yet.</p>
      <article v-for="article in data.articles" :key="article.id">
        <h2>
          <NuxtLink :to="`/@${article.author.username}/${article.slug}`">{{ article.title }}</NuxtLink>
        </h2>
        <p>
          <NuxtLink :to="`/@${article.author.username}`">{{ article.author.name }}</NuxtLink>
          · {{ article.readingTime }} min read
        </p>
        <p v-if="article.excerpt">{{ article.excerpt }}</p>
      </article>
    </div>
  </div>
</template>
