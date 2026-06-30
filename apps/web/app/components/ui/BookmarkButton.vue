<script setup lang="ts">
import { useBookmark } from '~/composables/useBookmark';

const props = defineProps<{ slug: string }>();
const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const { isBookmarked, loading, load, toggle } = useBookmark(
  apiBase,
  props.slug,
  auth.accessToken,
  () => auth.refreshAccessToken(),
);

onMounted(() => {
  if (auth.user) load();
});
</script>

<template>
  <button
    v-if="auth.user"
    :disabled="loading"
    class="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
    :class="isBookmarked ? 'border-accent text-accent' : 'text-ink hover:border-accent hover:text-accent'"
    @click="toggle"
  >
    <svg
      width="16" height="16" viewBox="0 0 24 24"
      :fill="isBookmarked ? 'currentColor' : 'none'"
      stroke="currentColor" stroke-width="2"
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
    {{ isBookmarked ? 'Saved' : 'Save' }}
  </button>
</template>
