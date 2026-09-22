// Thin client for the IRIS SysAdmin REST APIs (/api/admin), Basic auth.
export const IRIS_URL = (process.env.IRIS_URL ?? 'http://localhost:52773/api/admin').replace(/\/$/, '');
const USER = process.env.IRIS_USER ?? '_SYSTEM';
const PASS = process.env.IRIS_PASSWORD ?? 'SYS';

const auth = 'Basic ' + Buffer.from(`${USER}:${PASS}`).toString('base64');

export async function api(path: string, opts: { method?: string; body?: unknown; params?: Record<string, string> } = {}) {
  const url = new URL(IRIS_URL + path);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: auth,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    const summary = (data as { status?: { summary?: string } })?.status?.summary;
    throw new Error(`IRIS ${res.status}${summary ? `: ${summary}` : ''}`);
  }
  const env = data as { status?: { errors?: { error: string }[] }; result?: unknown };
  if (env?.status?.errors?.length) throw new Error(env.status.errors.map((e) => e.error).join('; '));
  return env?.result ?? data;
}
