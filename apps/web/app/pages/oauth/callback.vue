<script setup lang="ts">
import type { AuthUser } from '@hoard/shared';

const auth = useAuthStore();
const router = useRouter();
const errorMessage = ref<string | null>(null);

onMounted(async () => {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  const accessToken = params.get('accessToken');
  const userParam = params.get('user');

  if (!accessToken || !userParam) {
    errorMessage.value = 'Google sign-in failed. Please try again.';
    return;
  }

  const user = JSON.parse(userParam) as AuthUser;
  auth.setSession(user, accessToken);
  await router.push(`/@${user.username}`);
});
</script>

<template>
  <div class="mx-auto max-w-sm px-6 py-24 text-center">
    <p v-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>
    <p v-else class="text-sm text-ink-light">Signing you in...</p>
  </div>
</template>
