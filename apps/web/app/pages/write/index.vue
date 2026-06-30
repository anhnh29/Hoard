<script setup lang="ts">
const auth = useAuthStore();
const config = useRuntimeConfig();
const router = useRouter();

if (!auth.user) {
  await navigateTo('/login');
}

const article = await useApi<{ id: string }>(
  config.public.apiBase,
  '/articles',
  auth.accessToken,
  () => auth.refreshAccessToken(config.public.apiBase),
  { method: 'POST' },
);
await router.replace(`/write/${article.id}`);
</script>

<template>
  <div class="mx-auto max-w-sm px-6 py-24 text-center">
    <p class="text-sm text-ink-light">Creating a new draft...</p>
  </div>
</template>
