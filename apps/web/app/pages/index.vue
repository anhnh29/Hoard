<script setup lang="ts">
import ArticleCard from '~/components/ui/ArticleCard.vue';
import { useFeed } from '~/composables/useFeed';
import { useFollowingFeed } from '~/composables/useFollowingFeed';

const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const activeTab = ref<'following' | 'explore'>(auth.user ? 'following' : 'explore');

const exploreFeed = useFeed(apiBase);
const followingFeed = useFollowingFeed(
  apiBase,
  auth.accessToken,
  () => auth.refreshAccessToken(),
);

const feed = computed(() => activeTab.value === 'following' ? followingFeed : exploreFeed);

onMounted(() => {
  if (auth.user) followingFeed.loadMore();
  exploreFeed.loadMore();
});
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-12">
    <div class="mb-8 flex items-center gap-6 border-b border-border">
      <button
        v-if="auth.user"
        class="pb-3 text-sm font-medium transition-colors"
        :class="activeTab === 'following' ? 'border-b-2 border-ink text-ink' : 'text-ink-light hover:text-ink'"
        @click="activeTab = 'following'"
      >
        Following
      </button>
      <button
        class="pb-3 text-sm font-medium transition-colors"
        :class="activeTab === 'explore' ? 'border-b-2 border-ink text-ink' : 'text-ink-light hover:text-ink'"
        @click="activeTab = 'explore'"
      >
        Explore
      </button>
    </div>

    <p v-if="feed.error.value" class="text-sm text-red-600">{{ feed.error.value }}</p>

    <p v-else-if="feed.articles.value.length === 0 && !feed.loading.value" class="text-sm text-ink-light">
      No articles yet.
    </p>

    <div class="divide-y divide-border">
      <ArticleCard v-for="article in feed.articles.value" :key="article.id" :article="article" class="py-8" />
    </div>

    <div class="mt-8 text-center">
      <p v-if="feed.loading.value" class="text-sm text-ink-light">Loading...</p>
      <button
        v-else-if="feed.nextCursor.value"
        class="rounded-full border border-border px-6 py-2 text-sm font-medium text-ink hover:border-accent hover:text-accent"
        @click="feed.loadMore()"
      >
        Load more
      </button>
    </div>
  </div>
</template>
