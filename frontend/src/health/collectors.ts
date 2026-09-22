import { axios } from '../api/axios-instance';
import type { Telemetry } from './types';

const result = (d: unknown) =>
  (d as { result?: unknown })?.result ?? d;

async function safe<T>(fn: () => Promise<T>): Promise<{ data?: T; error?: string }> {
  try {
    return { data: await fn() };
  } catch (e) {
    const err = e as { response?: { data?: { status?: { summary?: string } }; status?: number }; message?: string };
    return {
      error:
        err?.response?.data?.status?.summary ||
        (err?.response?.status ? `HTTP ${err.response.status}` : err?.message || 'request failed'),
    };
  }
}

export interface CollectorResult {
  telemetry: Telemetry;
  errors: { collector: string; error: string }[];
}

const SOURCES: { key: keyof Telemetry; path: string; params?: Record<string, unknown> }[] = [
  { key: 'info', path: '/info' },
  { key: 'dashboard', path: '/v2/monitor/dashboard/main' },
  { key: 'databases', path: '/v2/databases' },
  { key: 'processes', path: '/v2/processes' },
  { key: 'locks', path: '/v2/locks' },
  { key: 'tasks', path: '/v2/tasks' },
  { key: 'taskHistory', path: '/v2/task/history' },
  { key: 'users', path: '/v2/security/users' },
  { key: 'roles', path: '/v2/security/roles' },
  { key: 'services', path: '/v2/security/services' },
  { key: 'auditEvents', path: '/v2/security/audit/events' },
  { key: 'webApps', path: '/v2/web-apps' },
  { key: 'journalSettings', path: '/v2/journal/settings' },
  { key: 'licenseUsage', path: '/v2/license/usage' },
  { key: 'x509', path: '/v2/security/x509-credentials' },
  { key: 'sslConfigs', path: '/v2/security/ssl-configurations' },
  { key: 'namespaces', path: '/v2/namespaces' },
  { key: 'devices', path: '/v2/devices' },
  { key: 'asyncOps', path: '/v2/async-results' },
];

/** Fetch all telemetry in parallel; individual failures degrade gracefully. */
export async function collectTelemetry(
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<CollectorResult> {
  const telemetry: Telemetry = {};
  const errors: CollectorResult['errors'] = [];
  let done = 0;
  await Promise.all(
    SOURCES.map(async ({ key, path, params }) => {
      const r = await safe(() => axios.get(path, { params }).then((x) => result(x.data)));
      if (r.error) errors.push({ collector: key, error: r.error });
      else (telemetry as Record<string, unknown>)[key] = r.data;
      done++;
      onProgress?.(done, SOURCES.length, key);
    }),
  );
  return { telemetry, errors };
}
