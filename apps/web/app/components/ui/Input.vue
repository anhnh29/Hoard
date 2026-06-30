<script setup lang="ts">
withDefaults(defineProps<{ type?: string }>(), { type: 'text' });
const model = defineModel<string>();
</script>

<template>
  <input
    v-model="model"
    :type="type"
    class="w-full rounded-md border border-border px-3 py-2 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
  />
</template>
