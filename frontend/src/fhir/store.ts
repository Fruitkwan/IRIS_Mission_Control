import { DEMO_BASE, DEMO_CAPABILITY, demoSearch } from './demo';

export interface FhirEndpoint {
  id: string;
  base: string; // e.g. /fhir/r4 or demo://fhir/r4
  label: string;
  demo?: boolean;
}

const LS = 'irisops-fhir-endpoints';

export function getEndpoints(): FhirEndpoint[] {
  let list: FhirEndpoint[] = [];
  try {
    list = JSON.parse(localStorage.getItem(LS) ?? '[]');
  } catch {
    list = [];
  }
  if (!list.some((e) => e.demo)) {
    list = [{ id: 'demo', base: DEMO_BASE, label: 'Synthetic demo server (R4)', demo: true }, ...list];
  }
  return list;
}

export function saveEndpoints(list: FhirEndpoint[]) {
  localStorage.setItem(LS, JSON.stringify(list.filter((e) => !e.demo)));
}

export function addEndpoint(base: string, label?: string) {
  const list = getEndpoints();
  if (!list.some((e) => e.base === base)) {
    list.push({ id: `ep-${Date.now()}`, base, label: label || base });
    saveEndpoints(list);
  }
}

export function removeEndpoint(id: string) {
  saveEndpoints(getEndpoints().filter((e) => e.id !== id));
}

export interface ProbeResult {
  ok: boolean;
  status?: number;
  latencyMs?: number;
  capability?: Record<string, unknown>;
  error?: string;
}

/** GET {base}/metadata — real HTTP for real endpoints, synthetic for demo. */
export async function probeEndpoint(ep: FhirEndpoint): Promise<ProbeResult> {
  if (ep.demo) {
    return { ok: true, latencyMs: 1, capability: DEMO_CAPABILITY };
  }
  const t0 = performance.now();
  try {
    const res = await fetch(`${ep.base.replace(/\/$/, '')}/metadata`, {
      headers: { Accept: 'application/fhir+json, application/json' },
      credentials: 'same-origin',
    });
    const latencyMs = Math.round(performance.now() - t0);
    if (!res.ok) return { ok: false, status: res.status, latencyMs, error: `HTTP ${res.status}` };
    const capability = await res.json();
    if (capability.resourceType !== 'CapabilityStatement') {
      return { ok: false, status: res.status, latencyMs, error: 'Response is not a CapabilityStatement' };
    }
    return { ok: true, status: res.status, latencyMs, capability };
  } catch (e) {
    return { ok: false, latencyMs: Math.round(performance.now() - t0), error: String(e) };
  }
}

export async function fhirRequest(
  ep: FhirEndpoint,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; latencyMs: number; data: unknown; headers: Record<string, string> }> {
  const t0 = performance.now();
  if (ep.demo) {
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
    const [type, id] = path.split('/');
    let data: unknown;
    if (id) {
      const found = demoSearch(type, {}).entry.find((e) => (e.resource as { id?: string }).id === id);
      data = found?.resource ?? { resourceType: 'OperationOutcome', issue: [{ severity: 'error', diagnostics: 'Not found (demo)' }] };
    } else {
      const params = Object.fromEntries(new URLSearchParams(path.split('?')[1] ?? ''));
      data = demoSearch(type, params);
    }
    return { status: 200, latencyMs: Math.round(performance.now() - t0), data, headers: { 'content-type': 'application/fhir+json (demo)' } };
  }
  const res = await fetch(`${ep.base.replace(/\/$/, '')}/${path}`, {
    method,
    headers: { Accept: 'application/fhir+json, application/json', ...(body ? { 'Content-Type': 'application/fhir+json' } : {}) },
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, latencyMs: Math.round(performance.now() - t0), data, headers };
}

/** Discover FHIR-ish endpoints from the IRIS web-app list. */
export function discoverFromWebApps(apps: Record<string, unknown>[]): string[] {
  return apps
    .map((a) => String(a.Name ?? ''))
    .filter((n) => /fhir/i.test(n));
}
