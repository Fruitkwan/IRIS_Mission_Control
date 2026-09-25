// Redacts secret-looking values before tool arguments are written to the audit log.
export const SECRET_KEYS = /pass|secret|token|key|credential|authorization/i;

export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '***' : sanitize(v)]),
    );
  }
  return value;
}
