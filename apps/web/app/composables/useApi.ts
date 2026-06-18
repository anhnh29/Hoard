interface UseApiOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

function isUnauthorized(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { statusCode?: number }).statusCode === 401);
}

export async function useApi<T>(
  apiBase: string,
  path: string,
  accessToken: string | null,
  onRefresh: () => Promise<string>,
  options: UseApiOptions = {},
): Promise<T> {
  const doFetch = (token: string | null) =>
    $fetch<T>(`${apiBase}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

  try {
    return await doFetch(accessToken);
  } catch (err) {
    if (isUnauthorized(err) && accessToken) {
      const newToken = await onRefresh();
      return await doFetch(newToken);
    }
    throw err;
  }
}
