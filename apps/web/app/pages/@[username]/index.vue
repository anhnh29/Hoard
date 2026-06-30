<script setup lang="ts">
import type { PublicProfile } from '@hoard/shared';
import Avatar from '~/components/ui/Avatar.vue';

const route = useRoute();
const config = useRuntimeConfig();
const auth = useAuthStore();
const username = route.params.username as string;

const { data, error } = await useFetch<PublicProfile>(`${config.public.apiBase}/users/${username}`);

const isOwnProfile = computed(() => auth.user?.username === username);
</script>

<template>
  <div class="mx-auto max-w-sm px-6 py-16">
    <p v-if="error" class="text-center text-ink-light">User not found.</p>
    <div v-else-if="data" class="space-y-4 text-center">
      <Avatar :src="data.avatarUrl" :name="data.name" :size="96" />
      <h1 class="font-serif text-3xl font-bold text-ink">{{ data.name }}</h1>
      <p class="text-ink-light">@{{ data.username }}</p>
      <p v-if="data.bio" class="text-ink">{{ data.bio }}</p>
      <div v-if="isOwnProfile" class="pt-4">
        <NuxtLink to="/settings/profile" class="text-sm font-semibold text-ink-light transition-colors hover:text-ink">
          Edit profile
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
