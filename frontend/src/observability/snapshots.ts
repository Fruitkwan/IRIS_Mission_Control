import { axios } from '../api/axios-instance';

const METRICS_LS = 'irisops-snapshots-metrics';
const CONFIG_LS = 'irisops-snapshots-config';
const MAX = 200;

export interface MetricSnapshot {
  ts: string;
  label?: string;
  assessmentScore?: number;
  loginAuditEnabled?: boolean;
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
  data: Record<string, unknown>;
}

const load = <T,>(key: string): T[] => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]');
  } catch {
    return [];
  }
};

export function getMetricSnapshots(): MetricSnapshot[] {
  return load<MetricSnapshot>(METRICS_LS);
}

export function saveDoctorSnapshot(label: string, assessmentScore: number, loginAuditEnabled: boolean): MetricSnapshot {
  const snap: MetricSnapshot = { ts: new Date().toISOString(), label, assessmentScore, loginAuditEnabled };
  localStorage.setItem(METRICS_LS, JSON.stringify([snap, ...getMetricSnapshots()].slice(0, MAX)));
  return snap;
}

export async function captureMetricSnapshot(): Promise<MetricSnapshot> {
  const { data } = await axios.get('/v2/monitor/dashboard/main');
  const r = data?.result ?? data;
  const perf = r?.Performance ?? {};
  const usage = r?.SystemUsage ?? {};
  const alerts = r?.Alerts ?? {};
  const lic = r?.Licensing ?? {};
  const locks = await axios.get('/v2/locks').then((x) => (x.data?.result ?? []).length).catch(() => undefined);
  const snap: MetricSnapshot = {
    ts: new Date().toISOString(),
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
  };
  const list = [snap, ...getMetricSnapshots()].slice(0, MAX);
  localStorage.setItem(METRICS_LS, JSON.stringify(list));
  return snap;
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

export function getConfigSnapshots(): ConfigSnapshot[] {
  return load<ConfigSnapshot>(CONFIG_LS);
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
  const snap: ConfigSnapshot = { id: `cfg-${Date.now()}`, ts: new Date().toISOString(), label, data };
  const list = [snap, ...getConfigSnapshots()].slice(0, 50);
  localStorage.setItem(CONFIG_LS, JSON.stringify(list));
  return snap;
}

export function deleteConfigSnapshot(id: string) {
  localStorage.setItem(CONFIG_LS, JSON.stringify(getConfigSnapshots().filter((s) => s.id !== id)));
}

/** Structural diff: returns lines like `users + {"Name":"x"}` / `roles - {...}` / `tasks ~ ...` */
export function diffConfigs(a: ConfigSnapshot, b: ConfigSnapshot) {
  const lines: { section: string; kind: '+' | '-' | '~'; text: string }[] = [];
  const itemKey = (v: unknown) => {
    const r = v as Record<string, unknown>;
    return String(r?.Name ?? r?.Id ?? r?.name ?? JSON.stringify(v));
  };
  for (const section of new Set([...Object.keys(a.data), ...Object.keys(b.data)])) {
    const va = a.data[section];
    const vb = b.data[section];
    if (Array.isArray(va) && Array.isArray(vb)) {
      const ma = new Map(va.map((x) => [itemKey(x), x]));
      const mb = new Map(vb.map((x) => [itemKey(x), x]));
      for (const [k, v] of mb) {
        if (!ma.has(k)) lines.push({ section, kind: '+', text: `${k}: ${JSON.stringify(v).slice(0, 140)}` });
        else if (JSON.stringify(ma.get(k)) !== JSON.stringify(v)) lines.push({ section, kind: '~', text: `${k} changed` });
      }
      for (const [k, v] of ma) {
        if (!mb.has(k)) lines.push({ section, kind: '-', text: `${k}: ${JSON.stringify(v).slice(0, 140)}` });
      }
    } else if (JSON.stringify(va) !== JSON.stringify(vb)) {
      lines.push({ section, kind: '~', text: 'configuration changed' });
    }
  }
  return lines;
}
