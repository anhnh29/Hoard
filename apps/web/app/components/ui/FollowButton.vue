<script setup lang="ts">
import { useFollow } from '~/composables/useFollow';

const props = defineProps<{ username: string }>();
const auth = useAuthStore();
const { public: { apiBase } } = useRuntimeConfig();

const { isFollowing, loading, load, toggle } = useFollow(
  apiBase,
  props.username,
  auth.accessToken,
  () => auth.refreshAccessToken(),
);

onMounted(load);
</script>

<template>
  <button
    v-if="auth.user && auth.user.username !== username"
    :disabled="loading"
    class="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
    :class="isFollowing
      ? 'border-border text-ink-light hover:border-red-300 hover:text-red-500'
      : 'border-accent bg-accent text-white hover:bg-accent/90'"
    @click="toggle"
  >
    {{ isFollowing ? 'Following' : 'Follow' }}
  </button>
</template>
