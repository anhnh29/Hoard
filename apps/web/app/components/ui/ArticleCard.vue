<script setup lang="ts">
import type { ArticleListItem } from '@hoard/shared';
import Avatar from '~/components/ui/Avatar.vue';
import BookmarkButton from '~/components/ui/BookmarkButton.vue';

defineProps<{ article: ArticleListItem }>();
</script>

<template>
  <article class="flex items-start justify-between gap-6 border-b border-border py-6">
    <div class="min-w-0 flex-1">
      <div class="mb-2 flex items-center gap-2 text-sm">
        <Avatar :src="article.author.avatarUrl" :name="article.author.name" :size="20" />
        <NuxtLink :to="`/@${article.author.username}`" class="font-medium text-ink hover:underline">
          {{ article.author.name }}
        </NuxtLink>
      </div>
      <NuxtLink :to="`/@${article.author.username}/${article.slug}`">
        <h2 class="font-serif text-xl font-bold leading-snug text-ink">{{ article.title }}</h2>
        <p v-if="article.excerpt" class="mt-1 line-clamp-2 font-serif text-base text-ink-light">
          {{ article.excerpt }}
        </p>
      </NuxtLink>
      <div class="mt-3 flex items-center gap-4">
        <p class="text-xs text-ink-light">
          {{ article.readingTime }} min read · {{ new Date(article.publishedAt).toLocaleDateString() }}
        </p>
        <BookmarkButton :slug="article.slug" />
      </div>
    </div>
    <img
      v-if="article.coverImageUrl"
      :src="article.coverImageUrl"
      :alt="article.title"
      class="h-24 w-24 shrink-0 rounded-md object-cover"
    />
  </article>
</template>
