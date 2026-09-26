import type { Finding, Telemetry } from './types';
// Explicit .ts extension: node:test loads this file via type stripping.
import { unwrap } from './collect.ts';

// Safe remediation for a small set of IRIS Doctor findings:
// preview (live read) → confirm → drift re-check → apply → verify → audit → rollback.
// Transport-agnostic so the flow is unit-tested without a live IRIS.

type Row = Record<string, unknown>;
type Params = Record<string, string>;

export interface RemediationApi {
  get(path: string, params?: Params): Promise<unknown>;
  put(path: string, body: unknown, params?: Params): Promise<unknown>;
  post(path: string, body?: unknown, params?: Params): Promise<unknown>;
}

export interface Change { field: string; before: string; after: string }

export interface Plan {
  /** Human-readable name of the affected resource. */
  target: string;
  /** Live values the change depends on; compared to detect drift. */
  state: Row;
  /** Field-level changes the fix will make. */
  changes: Change[];
  /** Live state already satisfies the rule. */
  resolved: boolean;
  /** Reason this fix must not be applied from here. */
  blocked?: string;
  /** Extra read-only facts that help the operator decide. */
  context: { label: string; value: string }[];
}

export interface Remediation {
  ruleId: string;
  mode: 'automatic' | 'guided';
  title: string;
  /** Exactly what the fix changes, and nothing else. */
  scope: string;
  /** Operational impact to weigh before confirming. */
  impact: string;
  /** How to reverse the change. */
  rollback: string;
  /** Manual steps for guided fixes. */
  steps?: string[];
  /** Shown once a fresh read confirms the fix. */
  confirmed: string;
  /** Collector whose data must be present before a rerun can confirm the finding cleared. */
  source: keyof Telemetry;
  plan(api: RemediationApi, finding: Finding): Promise<Plan>;
  apply?(api: RemediationApi, plan: Plan): Promise<void>;
  undo?(api: RemediationApi, before: Plan): Promise<void>;
}

export class RemediationError extends Error {
  code: 'blocked' | 'drift' | 'unverified' | 'unsupported';
  constructor(code: RemediationError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

const str = (v: unknown) => String(v ?? '');
const yesNo = (v: boolean) => (v ? 'enabled' : 'disabled');
const evidence = (finding: Finding, label: string) => finding.evidence.find((e) => e.label === label)?.value ?? '';
const read = async <T = Row>(api: RemediationApi, path: string, params?: Params) => unwrap(await api.get(path, params)) as T;

const stable = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(stable)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as Row).sort().map((k) => [k, stable((v as Row)[k])]))
      : v;
export const sameState = (a: Row, b: Row) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

// ---- Login auditing ----

const LOGIN_EVENT = { source: '%System', type: '%Login', name: 'Login' };

const loginAudit: Remediation = {
  ruleId: 'audit-login-off',
  mode: 'automatic',
  title: 'Enable login auditing',
  scope: 'Enables only the %System/%Login/Login audit event. No other audit event or setting changes.',
  impact: 'Every successful login writes an audit record. Audit database growth is proportional to login volume; keep audit purging scheduled.',
  rollback: 'Disable the %System/%Login/Login event again (Undo does this automatically if nothing else has changed it).',
  confirmed: 'IRIS confirmed login auditing is enabled.',
  source: 'auditEvents',
  async plan(api) {
    const [event, master] = await Promise.all([
      read(api, '/v2/security/audit/event', LOGIN_EVENT),
      read(api, '/v2/security/audit/enabled'),
    ]);
    const eventEnabled = event?.Enabled === true;
    const masterEnabled = master?.Enabled === true;
    return {
      target: '%System/%Login/Login',
      state: { eventEnabled },
      changes: eventEnabled ? [] : [{ field: 'Login event', before: 'disabled', after: 'enabled' }],
      resolved: eventEnabled,
      blocked: masterEnabled ? undefined : 'The master audit switch is disabled, so enabling this event would record nothing. Enable auditing on the Audit page first.',
      context: [{ label: 'Audit master switch', value: yesNo(masterEnabled) }],
    };
  },
  async apply(api) { await api.put('/v2/security/audit/event', { Enabled: true }, LOGIN_EVENT); },
  async undo(api) { await api.put('/v2/security/audit/event', { Enabled: false }, LOGIN_EVENT); },
};

// ---- Unauthenticated custom web application ----

export const AUTH_PASSWORD = 32;
export const AUTH_UNAUTHENTICATED = 64;
/** The portal shell must stay reachable without IRIS auth so its login page can load. */
const PROTECTED_APPS = new Set(['/irisops']);
const PROTECTED_DISPATCH = new Set(['IrisOps.Router']);

/** Remove unauthenticated access; fall back to password auth if nothing else remains. */
export const withoutUnauthenticated = (bits: number) => (bits & ~AUTH_UNAUTHENTICATED) || AUTH_PASSWORD;

const webApp: Remediation = {
  ruleId: 'webapp-unauth',
  mode: 'automatic',
  title: 'Require IRIS authentication for this web application',
  scope: 'Clears only the Unauthenticated flag on this application. Other authentication methods are kept; if none remain, password authentication is enabled.',
  impact: 'Clients that call this application anonymously will receive 401 responses. Confirm that no public endpoint, health probe or integration depends on anonymous access.',
  rollback: 'Re-enable Unauthenticated access for this application (Undo restores the exact previous authentication flags).',
  confirmed: 'IRIS confirmed the application no longer accepts unauthenticated access.',
  source: 'webApps',
  async plan(api, finding) {
    const name = evidence(finding, 'Application');
    const app = await read(api, '/v2/web-app', { name });
    const bits = Number(app?.AutheEnabled ?? 0);
    const unauth = (bits & AUTH_UNAUTHENTICATED) !== 0;
    const next = withoutUnauthenticated(bits);
    const blocked = PROTECTED_APPS.has(name) || PROTECTED_DISPATCH.has(str(app?.DispatchClass))
      ? 'This is the IRIS Mission Control portal shell. It must accept unauthenticated requests so the login page loads; the API layer enforces authentication.'
      : app?.Enabled === false ? 'The application is disabled, so it does not accept requests.' : undefined;
    return {
      target: name,
      state: { AutheEnabled: bits },
      changes: unauth ? [
        { field: 'Unauthenticated access', before: 'allowed', after: 'not allowed' },
        { field: 'Password authentication', before: yesNo((bits & AUTH_PASSWORD) !== 0), after: yesNo((next & AUTH_PASSWORD) !== 0) },
        { field: 'AutheEnabled', before: String(bits), after: String(next) },
      ] : [],
      resolved: !unauth,
      blocked,
      context: [
        { label: 'Namespace', value: str(app?.NameSpace) },
        { label: 'Dispatch class', value: str(app?.DispatchClass) || '—' },
        { label: 'Required resource', value: str(app?.Resource) || 'none' },
      ],
    };
  },
  async apply(api, plan) {
    await api.put('/v2/web-app', { AutheEnabled: withoutUnauthenticated(Number(plan.state.AutheEnabled)) }, { name: plan.target });
  },
  async undo(api, before) {
    await api.put('/v2/web-app', { AutheEnabled: Number(before.state.AutheEnabled) }, { name: before.target });
  },
};

// ---- Journal freeze-on-error ----

const journalFreeze: Remediation = {
  ruleId: 'journal-no-freeze',
  mode: 'automatic',
  title: 'Enable journal freeze-on-error',
  scope: 'Sets FreezeOnError to true. Journal directories, file size and purge settings are sent back unchanged.',
  impact: 'If IRIS cannot write to the journal, journaled updates freeze until the problem is fixed instead of continuing without a journal. This protects recoverability but can stop applications, so journal-space monitoring must be in place.',
  rollback: 'Set FreezeOnError back to false on the Journal page (Undo does this automatically if nothing else has changed it).',
  confirmed: 'IRIS confirmed journal freeze-on-error is enabled.',
  source: 'journalSettings',
  async plan(api) {
    const settings = await read(api, '/v2/journal/settings');
    const freeze = settings?.FreezeOnError === true;
    return {
      target: 'Journal settings',
      state: { settings },
      changes: freeze ? [] : [{ field: 'FreezeOnError', before: 'false', after: 'true' }],
      resolved: freeze,
      context: [
        { label: 'Journal directory', value: str(settings?.CurrentDirectory) },
        { label: 'Alternate directory', value: str(settings?.AlternateDirectory) || '—' },
      ],
    };
  },
  // Send the full settings back, as the Journal page does, so no other value is reset.
  async apply(api, plan) { await api.put('/v2/journal/settings', { ...(plan.state.settings as Row), FreezeOnError: true }); },
  async undo(api, before) { await api.put('/v2/journal/settings', { ...(before.state.settings as Row), FreezeOnError: false }); },
};

// ---- Suspended task ----

const suspendedTask: Remediation = {
  ruleId: 'task-suspended',
  mode: 'automatic',
  title: 'Resume this task',
  scope: 'Resumes only this task. Its schedule, class and settings are unchanged.',
  impact: 'The task runs at its next scheduled time. It may have been suspended deliberately or after repeated errors; review its recent history before resuming.',
  rollback: 'Suspend the task again from the Tasks page (Undo does this automatically if nothing else has changed it).',
  confirmed: 'IRIS confirmed the task is resumed.',
  source: 'tasks',
  async plan(api, finding) {
    const id = evidence(finding, 'Task ID');
    if (!id) {
      return { target: evidence(finding, 'Task'), state: {}, changes: [], resolved: false, blocked: 'This finding has no task ID. Run diagnostics again.', context: [] };
    }
    // The task list carries the Suspended flag; the detail endpoint does not.
    const [list, detail] = await Promise.all([read<Row[]>(api, '/v2/tasks'), read(api, '/v2/task', { id })]);
    const task = (list ?? []).find((t) => str(t.Id) === id);
    if (!task) {
      return { target: evidence(finding, 'Task'), state: { id, exists: false }, changes: [], resolved: false, blocked: 'The task no longer exists.', context: [] };
    }
    const suspended = task.Suspended === true;
    return {
      target: `${str(task.Name)} (ID ${id})`,
      state: { id, suspended },
      changes: suspended ? [{ field: 'Suspended', before: 'true', after: 'false' }] : [],
      resolved: !suspended,
      context: [
        { label: 'Task class', value: str(detail?.TaskClass) },
        { label: 'Namespace', value: str(detail?.NameSpace) },
        { label: 'Runs as', value: str(detail?.RunAsUser) },
        { label: 'Next scheduled', value: str(task.NextScheduled) || '—' },
        { label: 'Suspend on error', value: str(detail?.SuspendOnError) },
      ],
    };
  },
  async apply(api, plan) { await api.post('/v2/task/resume', {}, { id: str(plan.state.id) }); },
  async undo(api, before) { await api.post('/v2/task/suspend', {}, { id: str(before.state.id) }); },
};

// ---- Certificate expiry (guided: a replacement certificate cannot be generated safely) ----

const daysUntil = (date: string) => Math.floor((new Date(date).getTime() - Date.now()) / 86400000);

const certificate = (ruleId: string): Remediation => ({
  ruleId,
  mode: 'guided',
  title: 'Renew the certificate',
  scope: 'Guided: IRIS Mission Control does not generate or upload certificates. Follow the steps, then verify.',
  impact: 'TLS connections that use this credential fail once it expires. Replacing it takes effect for new connections.',
  rollback: 'Keep the previous certificate and key until the new one is verified; re-upload it to the same alias if the new one is rejected.',
  confirmed: 'IRIS reports the renewed certificate is valid for more than 30 days.',
  source: 'x509',
  steps: [
    'Request or issue a replacement certificate with the same subject and key usage.',
    'Open Secrets → X.509 credentials and edit this alias to upload the new certificate (and private key if it changed).',
    'Keep the old certificate and key until the new one is verified.',
    'Click "Verify" to re-read the expiry date from IRIS.',
  ],
  async plan(api, finding) {
    const alias = evidence(finding, 'Credential');
    const list = await read<Row[]>(api, '/v2/security/x509-credentials');
    const cred = (list ?? []).find((c) => str(c.Alias ?? c.Name) === alias);
    const expires = str(cred?.ExpirationDate ?? cred?.Expires ?? cred?.NotAfter);
    const days = expires ? daysUntil(expires) : NaN;
    let details: Row = {};
    try { details = (await read(api, '/v2/security/x509-credential/certificate', { alias })) ?? {}; } catch { /* details are optional context */ }
    return {
      target: alias,
      state: { expires },
      changes: [],
      resolved: Number.isFinite(days) && days > 30,
      context: [
        { label: 'Expires', value: expires || 'unknown' },
        { label: 'Days remaining', value: Number.isFinite(days) ? String(days) : 'unknown' },
        ...['SubjectDN', 'IssuerDN', 'SerialNumber'].filter((k) => details[k]).map((k) => ({ label: k, value: str(details[k]) })),
      ],
    };
  },
});

export const REMEDIATIONS: Remediation[] = [loginAudit, webApp, journalFreeze, suspendedTask, certificate('cert-expiring'), certificate('cert-expired')];

export const remediationFor = (ruleId: string) => REMEDIATIONS.find((r) => r.ruleId === ruleId);

// ---- Engine ----

/** Re-read, refuse on drift, apply, and verify against a fresh read. */
export async function applyRemediation(api: RemediationApi, r: Remediation, finding: Finding, previewed: Plan) {
  if (!r.apply) throw new RemediationError('unsupported', 'This fix is guided; apply it manually and verify.');
  const before = await r.plan(api, finding);
  if (before.blocked) throw new RemediationError('blocked', before.blocked);
  if (before.resolved || !sameState(before.state, previewed.state)) {
    throw new RemediationError('drift', 'The configuration changed since the preview. Review the current state before applying.');
  }
  await r.apply(api, before);
  const after = await r.plan(api, finding);
  if (!after.resolved) throw new RemediationError('unverified', 'IRIS accepted the request but a fresh read does not show the change.');
  return { before, after };
}

/** Restore the captured before-state, only if nothing changed since the fix. */
export async function rollbackRemediation(api: RemediationApi, r: Remediation, finding: Finding, before: Plan, after: Plan) {
  if (!r.undo) throw new RemediationError('unsupported', 'This fix has no automatic rollback.');
  const current = await r.plan(api, finding);
  if (!sameState(current.state, after.state)) {
    throw new RemediationError('drift', 'The configuration changed after the fix. Roll back manually using the guidance above.');
  }
  await r.undo(api, before);
  const restored = await r.plan(api, finding);
  if (!sameState(restored.state, before.state)) throw new RemediationError('unverified', 'A fresh read does not show the previous configuration.');
  return restored;
}

export interface AuditEntry {
  action: 'Apply' | 'Rollback';
  ruleId: string;
  target: string;
  outcome: 'verified' | 'failed';
  changes: Change[];
  detail?: string;
}

/** Payload for the IRIS audit record written by the broker: field names and before/after labels only, never secrets. */
export const auditEntry = (action: AuditEntry['action'], r: Remediation, plan: Plan, outcome: AuditEntry['outcome'], detail?: string): AuditEntry => ({
  action,
  ruleId: r.ruleId,
  target: plan.target,
  outcome,
  changes: action === 'Apply' ? plan.changes : plan.changes.map((c) => ({ field: c.field, before: c.after, after: c.before })),
  ...(detail ? { detail } : {}),
});
