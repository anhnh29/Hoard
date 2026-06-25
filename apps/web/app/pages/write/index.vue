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
  <p>Creating a new draft...</p>
</template>
