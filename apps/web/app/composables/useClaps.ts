import { ref } from 'vue';
import type { ClapStatus } from '@hoard/shared';
import { useApi } from './useApi';

const CLAP_CAP = 10;

export function useClaps(
  apiBase: string,
  slug: string,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
) {
  const totalClaps = ref(0);
  const userClaps = ref(0);
  const loading = ref(false);

  async function load() {
    try {
      const data = await useApi<ClapStatus>(apiBase, `/articles/${slug}/claps`, accessToken, onRefresh);
      totalClaps.value = data.totalClaps;
      userClaps.value = data.userClaps;
    } catch {
      // keep defaults
    }
  }

  async function clap() {
    if (loading.value || userClaps.value >= CLAP_CAP) return;
    loading.value = true;
    try {
      const data = await useApi<ClapStatus>(
        apiBase, `/articles/${slug}/claps`, accessToken, onRefresh,
        { method: 'POST', body: { count: 1 } },
      );
      totalClaps.value = data.totalClaps;
      userClaps.value = data.userClaps;
    } catch {
      // keep current state
    } finally {
      loading.value = false;
    }
  }

  return { totalClaps, userClaps, loading, load, clap };
}
