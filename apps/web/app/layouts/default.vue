<script setup lang="ts">
import Avatar from '~/components/ui/Avatar.vue';

const auth = useAuthStore();
</script>

<template>
  <div class="flex min-h-screen flex-col font-sans text-ink">
    <header class="border-b border-border">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <NuxtLink to="/" class="font-serif text-2xl font-bold text-ink">Hoard</NuxtLink>
        <div class="flex items-center gap-5 text-sm font-medium">
          <template v-if="auth.user">
            <NuxtLink to="/write" class="flex items-center gap-1.5 text-ink hover:text-accent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Write
            </NuxtLink>
            <NuxtLink :to="`/@${auth.user.username}`">
              <Avatar :name="auth.user.name" :size="32" />
            </NuxtLink>
          </template>
          <template v-else>
            <NuxtLink to="/login" class="text-ink hover:text-accent">Sign in</NuxtLink>
            <NuxtLink
              to="/signup"
              class="rounded-full bg-accent px-4 py-2 font-semibold text-white hover:bg-accent/90"
            >
              Get started
            </NuxtLink>
          </template>
        </div>
      </div>
    </header>
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
