import { ref, type Ref } from 'vue';
import { useApi } from './useApi';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useArticleAutosave(
  apiBase: string,
  articleId: string,
): { status: Ref<AutosaveStatus>; scheduleSave: (
  patch: Record<string, unknown>,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
) => void } {
  const status = ref<AutosaveStatus>('idle');
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let pendingPatch: Record<string, unknown> = {};

  function scheduleSave(
    patch: Record<string, unknown>,
    accessToken: string | null,
    onRefresh: () => Promise<string>,
  ) {
    pendingPatch = { ...pendingPatch, ...patch };
    if (timeoutId) clearTimeout(timeoutId);
    status.value = 'idle';
    timeoutId = setTimeout(async () => {
      const toSave = pendingPatch;
      pendingPatch = {};
      status.value = 'saving';
      try {
        await useApi(apiBase, `/articles/${articleId}`, accessToken, onRefresh, {
          method: 'PATCH',
          body: toSave,
        });
        status.value = 'saved';
      } catch {
        status.value = 'error';
      }
    }, 2000);
  }

  return { status, scheduleSave };
}
