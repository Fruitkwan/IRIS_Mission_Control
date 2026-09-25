import { axios } from '../api/axios-instance';
import { brokerFetch } from '../api/broker';

export { diffConfigs, latestFixPair } from './diff';

// Time Machine (metrics) and Configuration Drift (config) snapshots are stored in
// IRIS (IrisOps.Snapshot) through the broker, so they are durable, shared by every
// administrator and attributed to the user who captured them.

export interface MetricSnapshot {
  id?: string;
  ts: string;
  label?: string;
  createdBy?: string;
  assessmentScore?: number;
  /** Remediation this snapshot brackets, with its phase. */
  fix?: string;
  phase?: 'before' | 'after';
  globalRefsPerSec?: number;
  diskReads?: number;
  diskWrites?: number;
  cacheEfficiency?: number;
  processes?: number;
  locks?: number;
  journalEntries?: number;
  seriousAlerts?: number;
  appErrors?: number;
  licenseUse?: number;
  cspSessions?: number;
}

export interface ConfigSnapshot {
  id: string;
  ts: string;
  label: string;
  createdBy?: string;
  /** Present when loaded individually (lists return summaries). */
  data?: Record<string, unknown>;
}

interface StoredSnapshot {
  id: string;
  kind: 'metrics' | 'config';
  label: string;
  ts: string;
  createdBy: string;
  data?: Record<string, unknown>;
}

const save = (kind: StoredSnapshot['kind'], label: string, data: object) =>
  brokerFetch<StoredSnapshot>('/api/snapshots', { method: 'POST', body: JSON.stringify({ kind, label, data }) });

const toMetric = (s: StoredSnapshot): MetricSnapshot => ({ ...(s.data as Partial<MetricSnapshot>), id: s.id, ts: s.ts, label: s.label || undefined, createdBy: s.createdBy });

export async function listMetricSnapshots(): Promise<MetricSnapshot[]> {
  const { snapshots } = await brokerFetch<{ snapshots: StoredSnapshot[] }>('/api/snapshots?kind=metrics');
  return snapshots.map(toMetric);
}

export async function saveDoctorSnapshot(fix: string, phase: 'before' | 'after', assessmentScore: number) {
  await save('metrics', `${phase === 'before' ? 'Before' : 'After'} fix: ${fix}`, { assessmentScore, fix, phase });
}

export async function captureMetricSnapshot(): Promise<MetricSnapshot> {
  const { data } = await axios.get('/v2/monitor/dashboard/main');
  const r = data?.result ?? data;
  const perf = r?.Performance ?? {};
  const usage = r?.SystemUsage ?? {};
  const alerts = r?.Alerts ?? {};
  const lic = r?.Licensing ?? {};
  const locks = await axios.get('/v2/locks').then((x) => (x.data?.result ?? []).length).catch(() => undefined);
  return toMetric(await save('metrics', '', {
    globalRefsPerSec: perf.GlobalRefsPerSecond,
    diskReads: perf.DiskReads,
    diskWrites: perf.DiskWrites,
    cacheEfficiency: perf.CacheEfficiency,
    processes: usage.Processes,
    locks,
    journalEntries: usage.JournalEntries,
    seriousAlerts: alerts.SeriousAlerts,
    appErrors: alerts.ApplicationErrors,
    licenseUse: lic.LicenseUse,
    cspSessions: usage.CSPSessions,
  }));
}

const CONFIG_SECTIONS: Record<string, string> = {
  users: '/v2/security/users',
  roles: '/v2/security/roles',
  resources: '/v2/security/resources',
  services: '/v2/security/services',
  webApps: '/v2/web-apps',
  namespaces: '/v2/namespaces',
  databases: '/v2/databases',
  tasks: '/v2/tasks',
  ssl: '/v2/security/ssl-configurations',
  journal: '/v2/journal/settings',
};

export async function listConfigSnapshots(): Promise<ConfigSnapshot[]> {
  const { snapshots } = await brokerFetch<{ snapshots: StoredSnapshot[] }>('/api/snapshots?kind=config');
  return snapshots.map(({ id, ts, label, createdBy }) => ({ id, ts, label, createdBy }));
}

export async function getConfigSnapshot(id: string): Promise<ConfigSnapshot> {
  const { ts, label, createdBy, data } = await brokerFetch<StoredSnapshot>(`/api/snapshots/${encodeURIComponent(id)}`);
  return { id, ts, label, createdBy, data };
}

export async function captureConfigSnapshot(label: string): Promise<ConfigSnapshot> {
  const data: Record<string, unknown> = {};
  await Promise.all(
    Object.entries(CONFIG_SECTIONS).map(async ([k, p]) => {
      try {
        const r = await axios.get(p);
        data[k] = r.data?.result ?? r.data;
      } catch {
        data[k] = { error: 'unavailable' };
      }
    }),
  );
  const saved = await save('config', label, data);
  return { id: saved.id, ts: saved.ts, label: saved.label, createdBy: saved.createdBy, data };
}

export async function deleteConfigSnapshot(id: string) {
  await brokerFetch(`/api/snapshots/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ---- Snapshots saved in this browser by earlier versions ----

const LEGACY = { metrics: 'irisops-snapshots-metrics', config: 'irisops-snapshots-config' } as const;

const readLegacy = <T,>(key: string): T[] => {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]'); } catch { return []; }
};

export function legacySnapshotCount(kind: keyof typeof LEGACY) {
  return readLegacy(LEGACY[kind]).length;
}

/** Copy this browser's snapshots into IRIS (oldest first), then remove the local copies. */
export async function importLegacySnapshots(kind: keyof typeof LEGACY): Promise<number> {
  const local = readLegacy<MetricSnapshot & Partial<ConfigSnapshot>>(LEGACY[kind]).reverse();
  for (const snap of local) {
    const { ts, label, data, ...rest } = snap;
    const note = `imported from browser, captured ${new Date(ts).toLocaleString()}`;
    await save(kind, label ? `${label} (${note})` : note, kind === 'config' ? data ?? {} : rest);
  }
  localStorage.removeItem(LEGACY[kind]);
  return local.length;
}
