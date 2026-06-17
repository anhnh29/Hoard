import { ref } from 'vue';
import type { HealthStatus } from '@hoard/shared';

export async function useHealth(apiBase: string) {
  const data = ref<HealthStatus | null>(null);
  const error = ref<Error | null>(null);

  try {
    data.value = await $fetch<HealthStatus>(`${apiBase}/health`);
  } catch (err) {
    error.value = err instanceof Error ? err : new Error(String(err));
  }

  return { data, error };
}
