<script setup lang="ts">
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import type { PublicArticle } from '@hoard/shared';
import ClapButton from '~/components/ui/ClapButton.vue';
import BookmarkButton from '~/components/ui/BookmarkButton.vue';
import CommentThread from '~/components/ui/CommentThread.vue';

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

      <div class="mt-6 flex items-center justify-between">
        <ClapButton :slug="data.slug" />
        <BookmarkButton :slug="data.slug" />
      </div>

      <!-- safe: generateHTML only emits markup for the node/mark types declared
           in the extensions array above — it cannot emit arbitrary tags, since
           the input is our own Tiptap JSON, not raw user-supplied HTML. -->
      <div class="prose-serif mt-8" v-html="contentHtml" />

      <CommentThread :slug="data.slug" />
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
  margin-bottom: 1.25em;
}

.prose-serif :deep(h1),
.prose-serif :deep(h2),
.prose-serif :deep(h3) {
  font-family: var(--font-serif);
  font-weight: 700;
  margin: 1.5em 0 0.5em;
}

.prose-serif :deep(blockquote) {
  border-left: 3px solid #e5e7eb;
  padding-left: 1rem;
  color: #6b7280;
  font-style: italic;
}

.prose-serif :deep(code) {
  background: #f3f4f6;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.875em;
}

.prose-serif :deep(pre) {
  background: #1f2937;
  color: #f9fafb;
  padding: 1rem;
  border-radius: 6px;
  overflow-x: auto;
}

.prose-serif :deep(pre code) {
  background: none;
  padding: 0;
}

.prose-serif :deep(img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 1.5rem auto;
}

.prose-serif :deep(ul),
.prose-serif :deep(ol) {
  padding-left: 1.5rem;
  margin-bottom: 1.25em;
}

.prose-serif :deep(a) {
  text-decoration: underline;
}
</style>
