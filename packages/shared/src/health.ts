export interface HealthStatus {
  status: 'ok' | 'error';
  dbConnected: boolean;
}

export function isHealthStatus(value: unknown): value is HealthStatus {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.status === 'ok' || v.status === 'error') &&
    typeof v.dbConnected === 'boolean'
  );
}
