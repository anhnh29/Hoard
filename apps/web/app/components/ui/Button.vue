<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'secondary' | 'text'; type?: 'button' | 'submit' }>(), {
  variant: 'primary',
  type: 'button',
});
</script>

<template>
  <button
    :type="type"
    :class="[
      'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
      variant === 'primary' && 'bg-accent text-white hover:bg-accent/90',
      variant === 'secondary' && 'border border-ink text-ink hover:bg-neutral-50',
      variant === 'text' && 'text-ink-light hover:text-ink',
    ]"
  >
    <slot />
  </button>
</template>
