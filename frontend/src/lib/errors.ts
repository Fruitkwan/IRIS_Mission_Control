// Human-readable message for an API or network error.
export function errText(e: unknown): string {
  const err = e as {
    response?: { data?: { status?: { errors?: { error?: string }[] }; message?: string; errors?: { error?: string }[] }; status?: number };
    message?: string;
  };
  const d = err?.response?.data;
  return (
    d?.status?.errors?.[0]?.error ||
    d?.errors?.[0]?.error ||
    d?.message ||
    err?.message ||
    'Request failed'
  );
}
