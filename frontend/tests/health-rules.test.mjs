import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { evaluate, toReport } from '../src/health/rules.ts';

const daysFromNow = (d) => new Date(Date.now() + d * 86400000).toISOString();
const ids = (telemetry) => evaluate(telemetry).map((f) => f.ruleId);

// A configuration no rule should flag. Each case below mutates one aspect of it.
const healthy = () => ({
  dashboard: {
    SystemUsage: { DatabaseSpace: 'Normal', JournalSpace: 'Normal', DatabaseJournal: 'Normal', LockTable: 'Normal', WriteDaemon: 'Normal', BusyProcesses: [{ Process: 1, Commands: 10 }] },
    Status: { LastBackup: '2026-09-24 02:00', UpTime: '3d' },
    Alerts: { SeriousAlerts: 0, ApplicationErrors: 0 },
    Licensing: { LicenseLimit: 100, LicenseUseHigh: 10, LicenseUse: 5 },
  },
  databases: [{ Name: 'USER', Status: 'Mounted', MountRequired: false, MountAtStartup: true }, { Name: 'IRISLIB', Status: 'Mounted/R', MountAtStartup: true }],
  processes: [{ Pid: 1, Username: 'app', ElapsedTime: '01:00:00', Routine: 'X' }],
  locks: [],
  journalSettings: { FreezeOnError: true, CompressFiles: true },
  tasks: [{ Name: 'Purge', Suspended: false }],
  taskHistory: [{ Name: 'Purge', Status: 'Completed' }],
  services: [{ Name: '%Service_WebGateway', Enabled: true, Public: 'Yes', AuthenticationMethods: ['Password'] }, { Name: '%Service_Telnet', Enabled: false }],
  users: [{ Name: 'app', Enabled: true }, { Name: 'UnknownUser', Enabled: false }, { Name: 'Admin', Enabled: false }],
  auditEvents: [{ EventName: '%System/%Login/Login', Enabled: true }],
  webApps: [{ Name: '/custom', Enabled: true, AuthenticationMethods: ['Password'] }, { Name: '/off', Enabled: false, AuthenticationMethods: ['Unauthenticated'] }],
  x509: [{ Alias: 'server', ExpirationDate: daysFromNow(200) }],
});

const withChange = (mutate) => { const t = healthy(); mutate(t); return t; };

// One trigger per rule: [ruleId, mutation, expected severity, expected category, expected deep link]
const cases = [
  ['db-not-mounted', (t) => { t.databases[0].Status = 'Dismounted'; t.databases[0].MountRequired = true; }, 'critical', 'database', '/databases'],
  ['db-readonly', (t) => { t.databases[0].Status = 'Mounted/R'; }, 'warning', 'database', '/databases'],
  ['db-manual-mount', (t) => { t.databases[0].MountAtStartup = false; }, 'info', 'database', '/databases'],
  ['usage-databasespace', (t) => { t.dashboard.SystemUsage.DatabaseSpace = 'Troubled'; }, 'critical', 'database', '/dashboard'],
  ['usage-journalspace', (t) => { t.dashboard.SystemUsage.JournalSpace = 'Warning'; }, 'critical', 'journal', '/dashboard'],
  ['usage-databasejournal', (t) => { t.dashboard.SystemUsage.DatabaseJournal = 'Troubled'; }, 'critical', 'journal', '/dashboard'],
  ['usage-locktable', (t) => { t.dashboard.SystemUsage.LockTable = 'Warning'; }, 'warning', 'performance', '/dashboard'],
  ['usage-writedaemon', (t) => { t.dashboard.SystemUsage.WriteDaemon = 'Troubled'; }, 'warning', 'performance', '/dashboard'],
  ['serious-alerts', (t) => { t.dashboard.Alerts.SeriousAlerts = 2; }, 'critical', 'availability', '/logs'],
  ['app-errors', (t) => { t.dashboard.Alerts.ApplicationErrors = 3; }, 'warning', 'availability', '/logs'],
  ['no-backup', (t) => { t.dashboard.Status.LastBackup = 'Never'; }, 'recommendation', 'availability', '/tasks'],
  ['proc-long', (t) => { t.processes[0].ElapsedTime = '30:04:33'; }, 'info', 'performance', '/processes'],
  ['proc-busy', (t) => { t.dashboard.SystemUsage.BusyProcesses[0].Commands = 250000; }, 'warning', 'performance', '/processes'],
  ['locks-high', (t) => { t.locks = Array.from({ length: 501 }, (_, i) => ({ Name: `^L(${i})` })); }, 'warning', 'performance', '/locks'],
  ['journal-no-freeze', (t) => { t.journalSettings.FreezeOnError = false; }, 'warning', 'journal', '/journal'],
  ['journal-nocompress', (t) => { t.journalSettings.CompressFiles = false; }, 'recommendation', 'journal', '/journal'],
  ['task-suspended', (t) => { t.tasks[0].Suspended = true; }, 'info', 'tasks', '/tasks'],
  ['task-failures', (t) => { t.taskHistory[0].Status = 'Error'; }, 'warning', 'tasks', '/tasks'],
  ['svc-risky', (t) => { t.services[1].Enabled = true; }, 'recommendation', 'security', '/security/services'],
  ['svc-noauth', (t) => { t.services[0].AuthenticationMethods = []; }, 'critical', 'security', '/security/services'],
  ['unknown-user', (t) => { t.users[1].Enabled = true; }, 'warning', 'security', '/security/users'],
  ['default-acct', (t) => { t.users[2].Enabled = true; }, 'recommendation', 'security', '/security/users'],
  ['audit-login-off', (t) => { t.auditEvents[0].Enabled = false; }, 'warning', 'security', '/security/audit?event=%25System%2F%25Login%2FLogin'],
  ['webapp-unauth', (t) => { t.webApps[0].AuthenticationMethods = ['Unauthenticated']; }, 'warning', 'security', '/web-apps'],
  ['webapp-bundled-unauth', (t) => { t.webApps.push({ Name: '/csp/sys', Enabled: true, AuthenticationMethods: [] }); }, 'recommendation', 'security', '/web-apps'],
  ['cert-expired', (t) => { t.x509[0].ExpirationDate = daysFromNow(-3); }, 'critical', 'certificate', '/secrets/x509'],
  ['cert-expiring', (t) => { t.x509[0].ExpirationDate = daysFromNow(7.5); }, 'warning', 'certificate', '/secrets/x509'],
  ['license-saturation', (t) => { t.dashboard.Licensing.LicenseUseHigh = 95; }, 'warning', 'availability', '/license'],
];

test('a healthy configuration produces no findings and a perfect score', () => {
  const report = toReport(evaluate(healthy()), []);
  assert.deepEqual(report.findings, []);
  assert.equal(report.overall, 100);
  assert.ok(report.scores.every((s) => s.score === 100));
});

test('empty telemetry (every collector failed) produces no findings rather than false alarms', () => {
  assert.deepEqual(evaluate({}), []);
});

for (const [ruleId, mutate, severity, category, link] of cases) {
  test(`rule ${ruleId} fires with evidence, severity, category and deep link`, () => {
    const findings = evaluate(withChange(mutate));
    // The mutation must trigger exactly this rule and nothing unrelated.
    assert.deepEqual(findings.map((f) => f.ruleId), [ruleId]);
    const [finding] = findings;
    assert.equal(finding.severity, severity);
    assert.equal(finding.category, category);
    assert.equal(finding.link, link);
    assert.ok(finding.evidence.length > 0, 'finding must carry evidence');
    assert.ok(finding.evidence.every((e) => typeof e.label === 'string' && typeof e.value === 'string'));
    assert.ok(finding.recommendation, 'finding must carry a recommendation');
  });
}

test('every rule defined in rules.ts has a test case', () => {
  const source = readFileSync(new URL('../src/health/rules.ts', import.meta.url), 'utf8');
  const staticIds = [...source.matchAll(/\bf\('([a-z0-9-]+)'/g)].map((m) => m[1]);
  const usageKeys = [...source.matchAll(/\['(\w+)', '[^']+', '\w+', '\w+'\]/g)].map((m) => `usage-${m[1].toLowerCase()}`);
  assert.ok(usageKeys.length > 0, 'usage checks table not found; update this test');
  const defined = new Set([...staticIds, ...usageKeys]);
  const tested = new Set(cases.map(([id]) => id));
  assert.deepEqual([...defined].filter((id) => !tested.has(id)), [], 'untested rules');
  assert.deepEqual([...tested].filter((id) => !defined.has(id)), [], 'tests for rules that no longer exist');
});

// ---- Rule thresholds and boundaries ----

test('optional unmounted databases are reported without claiming an outage', () => {
  const [finding] = evaluate({ databases: [{ Name: 'IPM', Status: 'Unmounted', MountRequired: false }] });
  assert.equal(finding.ruleId, 'db-not-mounted');
  assert.equal(finding.severity, 'info');
  assert.match(finding.description, /may be intentional/);
  const [required] = evaluate({ databases: [{ Name: 'APP', Status: 'Unmounted', MountRequired: true }] });
  assert.equal(required.severity, 'critical');
});

test('system read-only databases are expected; ENSLIB read-only is informational', () => {
  assert.deepEqual(ids({ databases: [{ Name: 'IRISLIB', Status: 'Mounted/R' }, { Name: 'IRISAUDIT', Status: 'Mounted/R' }] }), []);
  assert.equal(evaluate({ databases: [{ Name: 'ENSLIB', Status: 'Mounted/R' }] })[0].severity, 'info');
});

test('long-running process threshold is more than six hours, user processes only', () => {
  const proc = (ElapsedTime, Username = 'app') => ({ processes: [{ Pid: 9, Username, ElapsedTime }] });
  assert.deepEqual(ids(proc('06:59:59')), []);
  assert.deepEqual(ids(proc('07:00:00')), ['proc-long']);
  assert.deepEqual(ids(proc('30:00:00', '')), [], 'system processes (no username) are ignored');
});

test('long-running and busy process findings are capped', () => {
  const processes = Array.from({ length: 9 }, (_, i) => ({ Pid: i, Username: 'app', ElapsedTime: '12:00:00' }));
  const BusyProcesses = Array.from({ length: 9 }, (_, i) => ({ Process: i, Commands: 200001 }));
  const found = ids({ processes, dashboard: { SystemUsage: { BusyProcesses } } });
  assert.equal(found.filter((id) => id === 'proc-long').length, 5);
  assert.equal(found.filter((id) => id === 'proc-busy').length, 3);
});

test('lock count threshold is strictly above 500', () => {
  const locks = (n) => ({ locks: Array.from({ length: n }, () => ({})) });
  assert.deepEqual(ids(locks(500)), []);
  assert.deepEqual(ids(locks(501)), ['locks-high']);
});

test('certificate expiry severity escalates as the date approaches', () => {
  const sev = (days) => evaluate({ x509: [{ Alias: 'c', ExpirationDate: daysFromNow(days) }] })[0]?.severity;
  assert.equal(sev(45), undefined);
  assert.equal(sev(25.5), 'recommendation');
  assert.equal(sev(10.5), 'warning');
  assert.equal(sev(-1), 'critical');
});

test('certificate expiry accepts alternative date fields', () => {
  assert.deepEqual(ids({ x509: [{ Name: 'a', NotAfter: daysFromNow(-2) }] }), ['cert-expired']);
  assert.deepEqual(ids({ x509: [{ Name: 'b', Expires: daysFromNow(-2) }] }), ['cert-expired']);
  assert.deepEqual(ids({ x509: [{ Name: 'c' }] }), [], 'no date means no finding');
});

test('license saturation triggers at 90% of the limit and ignores unlimited licenses', () => {
  const lic = (LicenseLimit, LicenseUseHigh) => ({ dashboard: { Licensing: { LicenseLimit, LicenseUseHigh } } });
  assert.deepEqual(ids(lic(100, 89)), []);
  assert.deepEqual(ids(lic(100, 90)), ['license-saturation']);
  assert.deepEqual(ids(lic(0, 500)), []);
});

test('a public, enabled risky service with no authentication is both reviewed and critical', () => {
  const found = ids({ services: [{ Name: '%Service_Telnet', Enabled: true, Public: 'Yes', AuthenticationMethods: [] }] });
  assert.deepEqual(found.sort(), ['svc-noauth', 'svc-risky']);
});

test('UnknownUser is reported once, as its own rule rather than a default account', () => {
  assert.deepEqual(ids({ users: [{ Name: 'UnknownUser', Enabled: true }] }), ['unknown-user']);
});

test('bundled web apps are reviewed together while custom apps remain individual findings', () => {
  const findings = evaluate({ webApps: [
    { Name: '/csp/sys', Enabled: true, AuthenticationMethods: ['Unauthenticated'] },
    { Name: '/api/monitor', Enabled: true, AuthenticationMethods: ['Unauthenticated'] },
    { Name: '/custom', Enabled: true, AuthenticationMethods: ['Unauthenticated'] },
  ] });
  assert.equal(findings.filter((finding) => finding.ruleId === 'webapp-bundled-unauth').length, 1);
  assert.equal(findings.filter((finding) => finding.ruleId === 'webapp-unauth').length, 1);
  assert.match(findings.find((finding) => finding.ruleId === 'webapp-unauth').description, /may still enforce authorization/);
});

test('finding ids are unique within a run and restart on each evaluation', () => {
  const t = withChange((x) => { x.users[1].Enabled = true; x.users[2].Enabled = true; });
  const first = evaluate(t).map((f) => f.id);
  assert.equal(new Set(first).size, first.length);
  assert.deepEqual(evaluate(t).map((f) => f.id), first);
});

// ---- Scoring ----

test('score deducts a fixed penalty per severity, averaged over seven categories', () => {
  const report = (mutate) => toReport(evaluate(withChange(mutate)), []);
  const score = (r, category) => r.scores.find((s) => s.category === category).score;
  const critical = report((t) => { t.dashboard.Alerts.SeriousAlerts = 1; });
  assert.equal(score(critical, 'availability'), 70);
  assert.equal(critical.overall, Math.round((6 * 100 + 70) / 7));
  assert.equal(score(report((t) => { t.journalSettings.FreezeOnError = false; }), 'journal'), 88);
  assert.equal(score(report((t) => { t.tasks[0].Suspended = true; }), 'tasks'), 96);
  assert.equal(score(report((t) => { t.journalSettings.CompressFiles = false; }), 'journal'), 97);
});

test('distinct rules in one category accumulate penalties', () => {
  const r = toReport(evaluate(withChange((t) => { t.services[0].AuthenticationMethods = []; t.auditEvents[0].Enabled = false; })), []);
  assert.equal(r.scores.find((s) => s.category === 'security').score, 100 - 30 - 12);
});

test('category scores are clamped at zero', () => {
  const finding = (ruleId) => ({ id: ruleId, ruleId, category: 'security', severity: 'critical', title: '', description: '', evidence: [], source: 'test', detectedAt: '' });
  const report = toReport(['a', 'b', 'c', 'd'].map(finding), []);
  assert.equal(report.scores.find((s) => s.category === 'security').score, 0);
  assert.equal(report.overall, Math.round(600 / 7));
});

test('repeated resources do not each deduct the full rule penalty', () => {
  const app = (name) => ({ Name: name, Enabled: true, AuthenticationMethods: ['Unauthenticated'] });
  const one = toReport(evaluate({ webApps: [app('/a')] }), []);
  const three = toReport(evaluate({ webApps: [app('/a'), app('/b'), app('/c')] }), []);
  assert.equal(three.findings.length, 3);
  assert.equal(three.scores.find((score) => score.category === 'security').score,
    one.scores.find((score) => score.category === 'security').score);
  assert.match(three.scoreMethod, /not an InterSystems health metric/);
});

test('summary counts match findings and collector errors pass through', () => {
  const t = withChange((x) => { x.dashboard.Alerts.SeriousAlerts = 1; x.tasks[0].Suspended = true; x.users[2].Enabled = true; x.journalSettings.FreezeOnError = false; });
  const errors = [{ collector: 'locks', error: 'HTTP 403' }];
  const report = toReport(evaluate(t), errors);
  assert.deepEqual(report.summary, { critical: 1, warning: 1, info: 1, recommendation: 1 });
  assert.deepEqual(report.collectorErrors, errors);
});

test('login audit finding remains available for the demo workflow', () => {
  const report = toReport(evaluate({ auditEvents: [{ EventName: '%System/%Login/Login', Enabled: false }] }), []);
  const finding = report.findings.find((item) => item.ruleId === 'audit-login-off');
  assert.equal(finding.severity, 'warning');
  assert.equal(new URLSearchParams(finding.link.split('?')[1]).get('event'), '%System/%Login/Login');
  const fixed = toReport(evaluate({ auditEvents: [{ EventName: '%System/%Login/Login', Enabled: true }] }), []);
  assert.equal(fixed.findings.some((item) => item.ruleId === 'audit-login-off'), false);
  assert.ok(fixed.overall > report.overall);
});
