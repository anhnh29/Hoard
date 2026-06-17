<script setup lang="ts">
const config = useRuntimeConfig();
const { data, error } = await useHealth(config.public.apiBase);
</script>

<template>
  <div>
    <h1>System health</h1>
    <p v-if="error">API unreachable: {{ error.message }}</p>
    <pre v-else-if="data">{{ data }}</pre>
  </div>
</template>
