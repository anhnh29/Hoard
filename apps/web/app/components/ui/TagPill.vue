<script setup lang="ts">
defineProps<{ name: string }>();
</script>

<template>
  <span class="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-ink-light">
    {{ name }}
    <slot />
  </span>
</template>
