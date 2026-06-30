<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ src?: string | null; name: string; size?: number }>(), {
  src: null,
  size: 32,
});

const initial = computed(() => props.name.trim().charAt(0).toUpperCase() || '?');
const sizePx = computed(() => `${props.size}px`);
</script>

<template>
  <img
    v-if="src"
    :src="src"
    :alt="name"
    class="rounded-full object-cover"
    :style="{ width: sizePx, height: sizePx }"
  />
  <div
    v-else
    class="flex items-center justify-center rounded-full bg-border font-sans font-semibold text-ink-light"
    :style="{ width: sizePx, height: sizePx }"
  >
    {{ initial }}
  </div>
</template>
