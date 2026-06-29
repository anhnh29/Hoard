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
  <div>
    <p v-if="error">Article not found.</p>
    <article v-else-if="data">
      <img v-if="data.coverImageUrl" :src="data.coverImageUrl" :alt="data.title" />
      <h1>{{ data.title }}</h1>
      <p>
        <NuxtLink :to="`/@${data.author.username}`">{{ data.author.name }}</NuxtLink>
        · {{ data.readingTime }} min read · {{ new Date(data.publishedAt).toLocaleDateString() }}
      </p>
      <p>
        <NuxtLink v-for="tag in data.tags" :key="tag.slug" :to="`/tag/${tag.slug}`">{{ tag.name }}</NuxtLink>
      </p>
      <!-- safe: generateHTML only emits markup for the node/mark types declared
           in the extensions array above — it cannot emit arbitrary tags, since
           the input is our own Tiptap JSON, not raw user-supplied HTML. -->
      <div v-html="contentHtml" />
    </article>
  </div>
</template>
