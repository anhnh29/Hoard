<script setup lang="ts">
import type { PublicProfile } from '@hoard/shared';

const route = useRoute();
const config = useRuntimeConfig();
const username = route.params.username as string;

const { data, error } = await useFetch<PublicProfile>(`${config.public.apiBase}/users/${username}`);
</script>

<template>
  <div>
    <p v-if="error">User not found.</p>
    <div v-else-if="data">
      <img v-if="data.avatarUrl" :src="data.avatarUrl" :alt="data.name" />
      <h1>{{ data.name }}</h1>
      <p>@{{ data.username }}</p>
      <p v-if="data.bio">{{ data.bio }}</p>
    </div>
  </div>
</template>
