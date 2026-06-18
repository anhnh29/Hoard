import { defineStore } from 'pinia';
import type { AuthUser } from '@hoard/shared';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    accessToken: null,
  }),
  actions: {
    setSession(user: AuthUser, accessToken: string) {
      this.user = user;
      this.accessToken = accessToken;
    },
    clearSession() {
      this.user = null;
      this.accessToken = null;
    },
    async refreshAccessToken(apiBase: string): Promise<string> {
      const result = await $fetch<{ accessToken: string }>(`${apiBase}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      this.accessToken = result.accessToken;
      return result.accessToken;
    },
  },
});
