// Client for the /irisops-broker web app (remediation audit, snapshots, cloud tests).
// The broker keeps a CSP session in an HttpOnly, SameSite=Strict cookie: the browser
// never holds a broker token, and scripts cannot read the session.

const BASE = '/irisops-broker';
// Required by the broker on every state-changing request; cross-site pages cannot set it.
const CSRF_HEADER = { 'X-Requested-With': 'IrisOps' };

const basicAuth = (user: string, password: string) => {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
};

/** Start the broker session at portal login. The password is sent once and not kept. */
export async function startBrokerSession(user: string, password: string) {
  await endBrokerSession(); // drop any session left by a previous user
  const response = await fetch(`${BASE}/api/session`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { ...CSRF_HEADER, Authorization: basicAuth(user, password) },
  });
  if (!response.ok) throw new Error(`Broker sign-in failed (HTTP ${response.status})`);
}

export async function endBrokerSession() {
  try {
    await fetch(`${BASE}/api/session`, { method: 'DELETE', credentials: 'same-origin', headers: CSRF_HEADER });
  } catch { /* nothing to end */ }
}

export class BrokerError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MESSAGES: Record<number, string> = {
  401: 'Broker session expired. Sign out and sign in again.',
  403: 'Access denied by the broker. This action requires the %Admin_Secure privilege.',
};

/** JSON request to the broker; throws BrokerError with a readable message on failure. */
export async function brokerFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...CSRF_HEADER, ...init.headers },
  });
  const isJson = (response.headers.get('content-type') ?? '').includes('application/json');
  const body = isJson ? await response.json() : undefined;
  if (!response.ok) {
    throw new BrokerError(response.status, MESSAGES[response.status] ?? body?.detail ?? `Broker returned HTTP ${response.status}`);
  }
  return body as T;
}
