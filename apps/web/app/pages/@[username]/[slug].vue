<script setup lang="ts">
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import type { PublicArticle } from '@hoard/shared';

const route = useRoute();
const config = useRuntimeConfig();
const username = route.params.username as string;
const slug = route.params.slug as string;

const { data, error } = await useFetch<PublicArticle>(
  `${config.public.apiBase}/articles/by-slug/${username}/${slug}`,
);

const contentHtml = computed(() =>
  data.value ? generateHTML(data.value.content, [StarterKit, Image, Link]) : '',
);
</script>

<template>
  <div class="mx-auto max-w-[680px] px-6 py-12">
    <p v-if="error" class="text-sm text-ink-light">Article not found.</p>
    <article v-else-if="data">
      <img v-if="data.coverImageUrl" :src="data.coverImageUrl" :alt="data.title" class="mb-8 w-full rounded-md object-cover" />
      <h1 class="font-serif text-4xl font-bold leading-tight text-ink">{{ data.title }}</h1>
      <p class="mt-4 text-sm text-ink-light">
        <NuxtLink :to="`/@${data.author.username}`" class="font-medium text-ink hover:underline">
          {{ data.author.name }}
        </NuxtLink>
        · {{ data.readingTime }} min read · {{ new Date(data.publishedAt).toLocaleDateString() }}
      </p>
      <p class="mt-3 flex flex-wrap gap-2">
        <NuxtLink
          v-for="tag in data.tags"
          :key="tag.slug"
          :to="`/tag/${tag.slug}`"
          class="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-ink-light hover:bg-neutral-200"
        >
          {{ tag.name }}
        </NuxtLink>
      </p>
      <!-- safe: generateHTML only emits markup for the node/mark types declared
           in the extensions array above — it cannot emit arbitrary tags, since
           the input is our own Tiptap JSON, not raw user-supplied HTML. -->
      <div class="prose-serif mt-8" v-html="contentHtml" />
    </article>
  </div>
</template>

<style scoped>
.prose-serif {
  font-family: var(--font-serif);
  font-size: 1.125rem;
  line-height: 1.7;
  color: #242424;
}

.prose-serif :deep(p) {
  margin: 1em 0;
}

.prose-serif :deep(h2) {
  font-weight: 700;
  font-size: 1.5rem;
  margin: 1.5em 0 0.5em;
}

.prose-serif :deep(a) {
  color: #1a8917;
  text-decoration: underline;
}

.prose-serif :deep(img) {
  max-width: 100%;
  border-radius: 6px;
}
</style>
