<script setup lang="ts">
const auth = useAuthStore();
</script>

<template>
  <div class="mx-auto max-w-2xl px-6 py-24 text-center">
    <h1 class="font-serif text-4xl font-bold text-ink">Human stories &amp; ideas</h1>
    <p class="mt-4 text-lg text-ink-light">A place to read, write, and deepen your understanding.</p>
    <div class="mt-8 flex items-center justify-center gap-4">
      <template v-if="auth.user">
        <NuxtLink
          to="/write"
          class="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent/90"
        >
          Start writing
        </NuxtLink>
        <NuxtLink :to="`/@${auth.user.username}`" class="text-sm font-medium text-ink hover:text-accent">
          Go to your profile
        </NuxtLink>
      </template>
      <template v-else>
        <NuxtLink
          to="/signup"
          class="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white hover:bg-accent/90"
        >
          Get started
        </NuxtLink>
        <NuxtLink to="/login" class="text-sm font-medium text-ink hover:text-accent">Sign in</NuxtLink>
      </template>
    </div>
  </div>
</template>
