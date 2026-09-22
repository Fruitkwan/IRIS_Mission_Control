import type { Finding, Severity, Telemetry } from './types';

type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? '');
const now = () => new Date().toISOString();

let n = 0;
function f(
  ruleId: string,
  category: Finding['category'],
  severity: Severity,
  title: string,
  description: string,
  evidence: Finding['evidence'],
  recommendation?: string,
  link?: string,
  source = 'IRIS SysAdmin API',
): Finding {
  return { id: `${ruleId}-${++n}`, ruleId, category, severity, title, description, evidence, recommendation, link, source, detectedAt: now() };
}

const SYSTEM_RO_DBS = new Set(['IRISLIB', 'IRISAUDIT']);
const RISKY_SERVICES = new Set(['%Service_Telnet', '%Service_Terminal', '%Service_FTP', '%Service_WebLink', '%Service_Bindings', '%Service_ComPort']);
const DEFAULT_ACCOUNTS = new Set(['_SYSTEM', 'Admin', 'SuperUser', 'CSPSystem', 'UnknownUser']);

export function evaluate(t: Telemetry): Finding[] {
  n = 0;
  const findings: Finding[] = [];
  const dash = t.dashboard ?? {};
  const usage = (dash.SystemUsage ?? {}) as Row;
  const status = (dash.Status ?? {}) as Row;
  const alerts = (dash.Alerts ?? {}) as Row;
  const lic = (dash.Licensing ?? {}) as Row;

  // ---- Databases ----
  for (const db of t.databases ?? []) {
    const name = str(db.Name);
    const st = str(db.Status);
    if (!st.toLowerCase().startsWith('mounted')) {
      findings.push(f('db-not-mounted', 'database', 'critical', `Database ${name} is not mounted`, `Database ${name} reports status "${st || 'unknown'}".`, [
        { label: 'Database', value: name }, { label: 'Status', value: st || 'unknown' }, { label: 'Directory', value: str(db.Directory) },
      ], 'Mount the database before dependent namespaces fail.', '/databases'));
    } else if (st.endsWith('/R') && !SYSTEM_RO_DBS.has(name)) {
      findings.push(f('db-readonly', 'database', 'warning', `Database ${name} is mounted read-only`, `${name} is mounted read-only. Writes will fail for namespaces mapped to it.`, [
        { label: 'Database', value: name }, { label: 'Status', value: st }, { label: 'Directory', value: str(db.Directory) },
      ], 'Verify this is intentional; remount read-write if applications need to write.', '/databases'));
    }
    if (db.MountRequired === false && db.MountAtStartup === false && st.toLowerCase().startsWith('mounted')) {
      findings.push(f('db-manual-mount', 'database', 'info', `Database ${name} is not configured to mount at startup`, `${name} is mounted now but will not be mounted automatically after a restart.`, [
        { label: 'Database', value: name }, { label: 'MountAtStartup', value: str(db.MountAtStartup) },
      ], 'Enable MountAtStartup unless this database is intentionally manual.', '/databases'));
    }
  }

  // ---- Monitor dashboard signals ----
  const usageChecks: [keyof Row, string, Finding['category'], Severity][] = [
    ['DatabaseSpace', 'database free space', 'database', 'critical'],
    ['JournalSpace', 'journal free space', 'journal', 'critical'],
    ['DatabaseJournal', 'database journaling', 'journal', 'critical'],
    ['LockTable', 'lock table', 'performance', 'warning'],
    ['WriteDaemon', 'write daemon', 'performance', 'warning'],
  ];
  for (const [key, label, cat, sev] of usageChecks) {
    const v = str(usage[key]);
    if (v && v !== 'Normal') {
      findings.push(f(`usage-${String(key).toLowerCase()}`, cat, sev, `${label} status is ${v}`, `The system monitor reports ${label} status "${v}" (expected "Normal").`, [
        { label: 'Signal', value: label }, { label: 'Status', value: v },
      ], 'Investigate immediately — non-normal system usage states can cascade into outages.', '/dashboard'));
    }
  }

  const serious = Number(alerts.SeriousAlerts ?? 0);
  if (serious > 0) {
    findings.push(f('serious-alerts', 'availability', 'critical', `${serious} serious system alert${serious > 1 ? 's' : ''}`, 'The system monitor reports serious alerts requiring attention.', [
      { label: 'Serious alerts', value: String(serious) }, { label: 'Application errors', value: str(alerts.ApplicationErrors) },
    ], 'Review messages.log and the alert log.', '/logs'));
  }
  const appErrors = Number(alerts.ApplicationErrors ?? 0);
  if (appErrors > 0) {
    findings.push(f('app-errors', 'availability', 'warning', `${appErrors} application error${appErrors > 1 ? 's' : ''} logged`, 'Application errors were reported by the system monitor.', [
      { label: 'Application errors', value: String(appErrors) },
    ], 'Inspect the application error log.', '/logs'));
  }

  if (str(status.LastBackup) === 'Never') {
    findings.push(f('no-backup', 'availability', 'recommendation', 'No backup has ever run', 'IRIS reports LastBackup = "Never". This instance has no recorded backup.', [
      { label: 'LastBackup', value: 'Never' }, { label: 'Uptime', value: str(status.UpTime) },
    ], 'Configure and schedule backups before relying on this instance.', '/tasks'));
  }

  // ---- Processes ----
  const procs = t.processes ?? [];
  if (procs.length > 0) {
    const userProcs = procs.filter((p) => str(p.Username));
    const longRunning = userProcs.filter((p) => {
      const el = str(p.ElapsedTime);
      const m = /^(\d+):(\d{2}):(\d{2})/.exec(el);
      return m && (Number(m[1]) > 6 || el.includes('d'));
    });
    for (const p of longRunning.slice(0, 5)) {
      findings.push(f('proc-long', 'performance', 'info', `Process ${p.Pid} running for ${p.ElapsedTime}`, `User process ${p.Pid} (${str(p.Routine)}) has an unusually long elapsed time.`, [
        { label: 'PID', value: str(p.Pid) }, { label: 'User', value: str(p.Username) }, { label: 'Routine', value: str(p.Routine) }, { label: 'Elapsed', value: str(p.ElapsedTime) },
      ], 'Confirm this is a legitimate long-running job.', '/processes'));
    }
    const busy = ((usage.BusyProcesses as Row[]) ?? []).filter((b) => Number(b.Commands) > 100000);
    for (const b of busy.slice(0, 3)) {
      findings.push(f('proc-busy', 'performance', 'warning', `Process ${b.Process} is heavily loaded`, `Process ${b.Process} has executed ${Number(b.Commands).toLocaleString()} commands — it may be spinning.`, [
        { label: 'PID', value: str(b.Process) }, { label: 'Commands', value: Number(b.Commands).toLocaleString() },
      ], 'Examine the process; terminate if it is a runaway.', '/processes'));
    }
  }

  // ---- Locks ----
  const locks = t.locks ?? [];
  if (locks.length > 500) {
    findings.push(f('locks-high', 'performance', 'warning', `${locks.length} locks held`, 'An unusually high number of locks are held — possible contention or a lock leak.', [
      { label: 'Lock count', value: String(locks.length) },
    ], 'Check lock table usage and look for long-held locks.', '/locks'));
  }

  // ---- Journal ----
  const js = t.journalSettings;
  if (js && js.FreezeOnError === false) {
    findings.push(f('journal-no-freeze', 'journal', 'warning', 'Freeze-on-error is disabled', 'If the journal disk fails, IRIS will not freeze — database integrity can be compromised silently.', [
      { label: 'FreezeOnError', value: 'false' }, { label: 'JournalDir', value: str(js.CurrentDirectory) },
    ], 'Enable FreezeOnError unless you have an alternative journal failure strategy.', '/journal'));
  }
  if (js && js.CompressFiles === false) {
    findings.push(f('journal-nocompress', 'journal', 'recommendation', 'Journal compression is disabled', 'Journal files are not compressed; they will consume more disk.', [
      { label: 'CompressFiles', value: 'false' }, { label: 'FileSizeLimit', value: `${str(js.FileSizeLimit)} MB` },
    ], 'Consider enabling journal file compression.', '/journal'));
  }

  // ---- Tasks ----
  for (const task of t.tasks ?? []) {
    if (task.Suspended === true) {
      findings.push(f('task-suspended', 'tasks', 'info', `Task "${task.Name}" is suspended`, `Scheduled task ${task.Name} is suspended and will not run.`, [
        { label: 'Task', value: str(task.Name) }, { label: 'Next scheduled', value: str(task.NextScheduled) || '—' },
      ], 'Resume the task if it should be running.', '/tasks'));
    }
  }
  const failedRuns = (t.taskHistory ?? []).filter((h) => /error|fail/i.test(str(h.Status) + str(h.Error)));
  if (failedRuns.length > 0) {
    findings.push(f('task-failures', 'tasks', 'warning', `${failedRuns.length} failed task run${failedRuns.length > 1 ? 's' : ''} in history`, 'Recent task history contains failed runs.', [
      { label: 'Failed runs', value: String(failedRuns.length) }, { label: 'Latest', value: str(failedRuns[0]?.Name ?? failedRuns[0]?.Task ?? '') },
    ], 'Review task history for error details.', '/tasks'));
  }

  // ---- Security: services ----
  for (const svc of t.services ?? []) {
    const name = str(svc.Name);
    if (svc.Enabled === true && RISKY_SERVICES.has(name)) {
      findings.push(f('svc-risky', 'security', 'warning', `Insecure service ${name} is enabled`, `${name} (${str(svc.Description)}) is enabled. It is a legacy/insecure access path.`, [
        { label: 'Service', value: name }, { label: 'Public', value: str(svc.Public) }, { label: 'Auth methods', value: (svc.AuthenticationMethods as string[] ?? []).join(', ') || 'none' },
      ], 'Disable this service unless it is strictly required.', '/security/services'));
    }
    if (svc.Enabled === true && svc.Public === 'Yes' && (svc.AuthenticationMethods as string[] ?? []).length === 0) {
      findings.push(f('svc-noauth', 'security', 'critical', `Public service ${name} has no authentication`, `${name} is enabled, public, and has no authentication methods configured.`, [
        { label: 'Service', value: name }, { label: 'Public', value: 'Yes' }, { label: 'Auth methods', value: 'none' },
      ], 'Add authentication or disable the service immediately.', '/security/services'));
    }
  }

  // ---- Security: users ----
  for (const u of t.users ?? []) {
    const name = str(u.Name);
    if (name === 'UnknownUser' && u.Enabled === true) {
      findings.push(f('unknown-user', 'security', 'warning', 'UnknownUser account is enabled', 'The unauthenticated fallback account UnknownUser is enabled. Combined with unauthenticated web apps this can expose the system.', [
        { label: 'Account', value: 'UnknownUser' }, { label: 'Enabled', value: 'true' },
      ], 'Disable UnknownUser if no application relies on unauthenticated access.', '/security/users'));
    }
    if (DEFAULT_ACCOUNTS.has(name) && u.Enabled === true && name !== 'UnknownUser') {
      findings.push(f('default-acct', 'security', 'recommendation', `Default account ${name} is enabled`, `The well-known account ${name} is enabled. Default accounts are common attack targets.`, [
        { label: 'Account', value: name }, { label: 'Type', value: str(u.Type) },
      ], 'Rename or disable default accounts on production systems.', '/security/users'));
    }
  }

  // ---- Security: audit ----
  const loginAudit = (t.auditEvents ?? []).find((e) => str(e.EventName) === '%System/%Login/Login');
  if (loginAudit && loginAudit.Enabled === false) {
    findings.push(f('audit-login-off', 'security', 'warning', 'Login auditing is disabled', 'The %System/%Login/Login audit event is not enabled — successful logins are not recorded.', [
      { label: 'Event', value: '%System/%Login/Login' }, { label: 'Enabled', value: 'false' },
    ], 'Enable login auditing for security forensics.', '/security/audit'));
  }

  // ---- Web apps ----
  for (const app of t.webApps ?? []) {
    const methods = (app.AuthenticationMethods as string[]) ?? [];
    if (app.Enabled === true && (methods.includes('Unauthenticated') || methods.length === 0)) {
      findings.push(f('webapp-unauth', 'security', 'warning', `Web application ${app.Name} allows unauthenticated access`, `${app.Name} is enabled with unauthenticated access permitted.`, [
        { label: 'Application', value: str(app.Name) }, { label: 'Namespace', value: str(app.Namespace) }, { label: 'Auth methods', value: methods.join(', ') || 'none' },
      ], 'Require authentication unless this endpoint is intentionally public.', '/web-apps'));
    }
  }

  // ---- Certificates ----
  for (const cred of t.x509 ?? []) {
    const exp = str(cred.ExpirationDate ?? cred.Expires ?? cred.NotAfter);
    if (exp) {
      const days = Math.floor((new Date(exp).getTime() - Date.now()) / 86400000);
      if (days < 0) {
        findings.push(f('cert-expired', 'certificate', 'critical', `Certificate ${cred.Alias ?? cred.Name} is expired`, `The X.509 credential expired ${-days} day(s) ago.`, [
          { label: 'Credential', value: str(cred.Alias ?? cred.Name) }, { label: 'Expired', value: exp },
        ], 'Replace the certificate immediately.', '/secrets/x509'));
      } else if (days <= 30) {
        findings.push(f('cert-expiring', 'certificate', days <= 14 ? 'warning' : 'recommendation', `Certificate ${cred.Alias ?? cred.Name} expires in ${days} days`, 'Certificate expiry is approaching.', [
          { label: 'Credential', value: str(cred.Alias ?? cred.Name) }, { label: 'Expires', value: exp }, { label: 'Days remaining', value: String(days) },
        ], 'Schedule certificate renewal.', '/secrets/x509'));
      }
    }
  }

  // ---- License ----
  const lim = Number(lic.LicenseLimit ?? 0);
  const high = Number(lic.LicenseUseHigh ?? 0);
  if (lim > 0 && high >= lim * 0.9) {
    findings.push(f('license-saturation', 'availability', 'warning', 'License usage near limit', `Peak license usage (${high}) is close to the limit (${lim}).`, [
      { label: 'Limit', value: String(lim) }, { label: 'Peak use', value: String(high) }, { label: 'Current use', value: str(lic.LicenseUse) },
    ], 'Investigate license consumption or increase capacity.', '/license'));
  }

  // ---- Collector errors → info findings ----
  return findings;
}

export function toReport(findings: Finding[], collectorErrors: { collector: string; error: string }[]) {
  const categories: Finding['category'][] = ['availability', 'database', 'performance', 'security', 'certificate', 'journal', 'tasks'];
  const weight: Record<Severity, number> = { critical: 30, warning: 12, info: 4, recommendation: 3 };
  const scores = categories.map((category) => {
    const fs = findings.filter((x) => x.category === category);
    const score = Math.max(0, 100 - fs.reduce((s, x) => s + weight[x.severity], 0));
    return { category, score, findings: fs };
  });
  const overall = Math.round(scores.reduce((s, c) => s + c.score, 0) / scores.length);
  const summary = {
    critical: findings.filter((x) => x.severity === 'critical').length,
    warning: findings.filter((x) => x.severity === 'warning').length,
    info: findings.filter((x) => x.severity === 'info').length,
    recommendation: findings.filter((x) => x.severity === 'recommendation').length,
  };
  return { generatedAt: now(), scores, overall, findings, collectorErrors, summary };
}
