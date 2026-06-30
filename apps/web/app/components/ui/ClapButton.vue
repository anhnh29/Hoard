<script setup lang="ts">
import { useClaps } from '~/composables/useClaps';

const props = defineProps<{ slug: string }>();
const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const { totalClaps, userClaps, loading, load, clap } = useClaps(
  apiBase,
  props.slug,
  auth.accessToken,
  () => auth.refreshAccessToken(),
);

onMounted(load);

function handleClap() {
  if (!auth.user) {
    navigateTo('/login');
    return;
  }
  clap();
}
</script>

<template>
  <div class="flex items-center gap-2">
    <button
      :disabled="loading || userClaps >= 10"
      class="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
      @click="handleClap"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {{ totalClaps }}
    </button>
    <span v-if="auth.user" class="text-xs text-ink-light">{{ userClaps }}/10</span>
  </div>
</template>
