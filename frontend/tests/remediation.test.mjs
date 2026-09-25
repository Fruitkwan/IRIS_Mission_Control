import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate } from '../src/health/rules.ts';
import {
  REMEDIATIONS, remediationFor, applyRemediation, rollbackRemediation, auditEntry, withoutUnauthenticated, RemediationError,
} from '../src/health/remediation.ts';

const daysFromNow = (d) => new Date(Date.now() + d * 86400000).toISOString();

// In-memory IRIS that answers the SysAdmin endpoints the fixes use, with { result } envelopes.
function fakeIris(overrides = {}) {
  const db = {
    auditMaster: true,
    loginEvent: false,
    webApps: { '/custom': { Name: '/custom', AutheEnabled: 96, Enabled: true, NameSpace: 'USER', DispatchClass: 'App.REST' }, '/irisops': { Name: '/irisops', AutheEnabled: 96, Enabled: true, DispatchClass: 'IrisOps.Router' } },
    journal: { CurrentDirectory: '/j/', AlternateDirectory: '/alt/', FileSizeLimit: 1024, FreezeOnError: false, CompressFiles: true },
    tasks: [{ Id: 7, Name: 'Nightly purge', Suspended: true, NextScheduled: '2026-09-26 00:00' }],
    x509: [{ Alias: 'server', ExpirationDate: daysFromNow(10) }],
    ...overrides,
  };
  const writes = [];
  const ok = (result) => ({ status: { errors: [] }, result });
  return {
    writes,
    db,
    async get(path, params = {}) {
      switch (path) {
        case '/v2/security/audit/event': return ok({ Enabled: db.loginEvent });
        case '/v2/security/audit/enabled': return ok({ Enabled: db.auditMaster });
        case '/v2/web-app': return ok({ ...db.webApps[params.name] });
        case '/v2/journal/settings': return ok({ ...db.journal });
        case '/v2/tasks': return ok(db.tasks.map((t) => ({ ...t })));
        case '/v2/task': return ok({ TaskClass: '%SYS.Task.PurgeTaskHistory', NameSpace: '%SYS', RunAsUser: '_SYSTEM', SuspendOnError: true });
        case '/v2/security/x509-credentials': return ok(db.x509.map((c) => ({ ...c })));
        case '/v2/security/x509-credential/certificate': return ok({ SubjectDN: 'CN=server' });
        default: throw new Error(`unexpected GET ${path}`);
      }
    },
    async put(path, body, params = {}) {
      writes.push(['PUT', path, body, params]);
      if (path === '/v2/security/audit/event') db.loginEvent = body.Enabled;
      else if (path === '/v2/web-app') Object.assign(db.webApps[params.name], body);
      else if (path === '/v2/journal/settings') db.journal = { ...body };
      else throw new Error(`unexpected PUT ${path}`);
    },
    async post(path, body, params = {}) {
      writes.push(['POST', path, body, params]);
      const task = db.tasks.find((t) => String(t.Id) === params.id);
      if (path === '/v2/task/resume') task.Suspended = false;
      else if (path === '/v2/task/suspend') task.Suspended = true;
      else throw new Error(`unexpected POST ${path}`);
    },
  };
}

// Real findings produced by the rules engine, so evidence labels stay in sync with rules.ts.
const findingFor = (ruleId, telemetry) => {
  const finding = evaluate(telemetry).find((f) => f.ruleId === ruleId);
  assert.ok(finding, `rules engine did not produce ${ruleId}`);
  return finding;
};
const findings = {
  'audit-login-off': () => findingFor('audit-login-off', { auditEvents: [{ EventName: '%System/%Login/Login', Enabled: false }] }),
  'webapp-unauth': (name = '/custom') => findingFor('webapp-unauth', { webApps: [{ Name: name, Enabled: true, AuthenticationMethods: ['Unauthenticated'] }] }),
  'journal-no-freeze': () => findingFor('journal-no-freeze', { journalSettings: { FreezeOnError: false } }),
  'task-suspended': () => findingFor('task-suspended', { tasks: [{ Id: 7, Name: 'Nightly purge', Suspended: true }] }),
  'cert-expiring': () => findingFor('cert-expiring', { x509: [{ Alias: 'server', ExpirationDate: daysFromNow(10) }] }),
  'cert-expired': () => findingFor('cert-expired', { x509: [{ Alias: 'server', ExpirationDate: daysFromNow(-1) }] }),
};

test('every remediation targets a real rule and documents scope, impact and rollback', () => {
  const ruleIds = new Set(Object.keys(findings));
  for (const r of REMEDIATIONS) {
    assert.ok(ruleIds.has(r.ruleId), `${r.ruleId} has no finding fixture`);
    assert.ok(r.scope && r.impact && r.rollback, `${r.ruleId} must document scope, impact and rollback`);
    if (r.mode === 'automatic') assert.ok(r.apply && r.undo, `${r.ruleId} automatic fixes need apply and undo`);
    else assert.ok(r.steps?.length && !r.apply, `${r.ruleId} guided fixes need steps and no apply`);
  }
  assert.equal(remediationFor('locks-high'), undefined);
});

const automatic = ['audit-login-off', 'webapp-unauth', 'journal-no-freeze', 'task-suspended'];

for (const ruleId of automatic) {
  test(`${ruleId}: preview → apply → verify → rollback restores the exact previous state`, async () => {
    const api = fakeIris();
    const r = remediationFor(ruleId);
    const finding = findings[ruleId]();
    const preview = await r.plan(api, finding);
    assert.equal(preview.resolved, false);
    assert.equal(preview.blocked, undefined);
    assert.ok(preview.changes.length > 0, 'preview must show field-level changes');
    assert.equal(api.writes.length, 0, 'preview must not write');

    const { before, after } = await applyRemediation(api, r, finding, preview);
    assert.equal(after.resolved, true);
    assert.deepEqual(before.state, preview.state);

    const restored = await rollbackRemediation(api, r, finding, before, after);
    assert.deepEqual(restored.state, before.state);
    assert.equal(restored.resolved, false);
  });

  test(`${ruleId}: refuses to apply when the configuration changed since the preview`, async () => {
    const api = fakeIris();
    const r = remediationFor(ruleId);
    const finding = findings[ruleId]();
    const preview = await r.plan(api, finding);
    const stale = { ...preview, state: { ...preview.state, changedBy: 'someone else' } };
    await assert.rejects(applyRemediation(api, r, finding, stale), (e) => e instanceof RemediationError && e.code === 'drift');
    assert.equal(api.writes.length, 0);
  });
}

test('apply refuses when the finding was resolved elsewhere after the preview', async () => {
  const api = fakeIris();
  const r = remediationFor('audit-login-off');
  const finding = findings['audit-login-off']();
  const preview = await r.plan(api, finding);
  api.db.loginEvent = true;
  await assert.rejects(applyRemediation(api, r, finding, preview), { code: 'drift' });
  assert.equal(api.writes.length, 0);
});

test('apply fails loudly when IRIS accepts the write but the change does not stick', async () => {
  const api = fakeIris();
  api.put = async () => {}; // silently ignored write
  const r = remediationFor('journal-no-freeze');
  const finding = findings['journal-no-freeze']();
  await assert.rejects(applyRemediation(api, r, finding, await r.plan(api, finding)), { code: 'unverified' });
});

test('rollback refuses when someone changed the resource after the fix', async () => {
  const api = fakeIris();
  const r = remediationFor('task-suspended');
  const finding = findings['task-suspended']();
  const { before, after } = await applyRemediation(api, r, finding, await r.plan(api, finding));
  api.db.tasks[0].Suspended = true; // another admin re-suspended it
  const writes = api.writes.length;
  await assert.rejects(rollbackRemediation(api, r, finding, before, after), { code: 'drift' });
  assert.equal(api.writes.length, writes);
});

test('login audit fix is blocked while the master audit switch is off', async () => {
  const api = fakeIris({ auditMaster: false });
  const r = remediationFor('audit-login-off');
  const finding = findings['audit-login-off']();
  const preview = await r.plan(api, finding);
  assert.match(preview.blocked, /master audit switch/);
  await assert.rejects(applyRemediation(api, r, finding, preview), { code: 'blocked' });
  assert.equal(api.writes.length, 0);
});

test('web app fix clears only the Unauthenticated flag and never locks out the portal shell', async () => {
  assert.equal(withoutUnauthenticated(96), 32, 'password + unauthenticated → password');
  assert.equal(withoutUnauthenticated(64), 32, 'unauthenticated only → password fallback');
  assert.equal(withoutUnauthenticated(64 | 8192), 8192, 'other methods are kept without adding password');

  const api = fakeIris();
  const r = remediationFor('webapp-unauth');
  const custom = findings['webapp-unauth']();
  await applyRemediation(api, r, custom, await r.plan(api, custom));
  assert.deepEqual(api.writes, [['PUT', '/v2/web-app', { AutheEnabled: 32 }, { name: '/custom' }]], 'only AutheEnabled is sent');

  const shell = findings['webapp-unauth']('/irisops');
  const preview = await r.plan(api, shell);
  assert.match(preview.blocked, /portal shell/);
  await assert.rejects(applyRemediation(api, r, shell, preview), { code: 'blocked' });
});

test('journal fix sends every other setting back unchanged', async () => {
  const api = fakeIris();
  const r = remediationFor('journal-no-freeze');
  const finding = findings['journal-no-freeze']();
  await applyRemediation(api, r, finding, await r.plan(api, finding));
  assert.deepEqual(api.db.journal, { CurrentDirectory: '/j/', AlternateDirectory: '/alt/', FileSizeLimit: 1024, FreezeOnError: true, CompressFiles: true });
});

test('task fix resumes only the task named in the finding evidence', async () => {
  const api = fakeIris();
  const r = remediationFor('task-suspended');
  const finding = findings['task-suspended']();
  const preview = await r.plan(api, finding);
  assert.equal(preview.target, 'Nightly purge (ID 7)');
  assert.ok(preview.context.some((c) => c.label === 'Task class' && c.value === '%SYS.Task.PurgeTaskHistory'));
  await applyRemediation(api, r, finding, preview);
  assert.deepEqual(api.writes, [['POST', '/v2/task/resume', {}, { id: '7' }]]);
});

test('task fix is blocked when the task was deleted', async () => {
  const api = fakeIris({ tasks: [] });
  const r = remediationFor('task-suspended');
  const preview = await r.plan(api, findings['task-suspended']());
  assert.match(preview.blocked, /no longer exists/);
});

test('certificate fixes are guided and verify by re-reading the expiry date', async () => {
  const api = fakeIris();
  const r = remediationFor('cert-expiring');
  const finding = findings['cert-expiring']();
  const before = await r.plan(api, finding);
  assert.equal(before.resolved, false);
  assert.ok(before.context.some((c) => c.label === 'SubjectDN' && c.value === 'CN=server'));
  await assert.rejects(applyRemediation(api, r, finding, before), { code: 'unsupported' });

  api.db.x509[0].ExpirationDate = daysFromNow(365); // operator uploaded a renewed certificate
  assert.equal((await r.plan(api, finding)).resolved, true);
  assert.equal(api.writes.length, 0, 'guided fixes never write');
});

test('audit entries describe the change without secrets and invert changes on rollback', async () => {
  const api = fakeIris();
  const r = remediationFor('journal-no-freeze');
  const plan = await r.plan(api, findings['journal-no-freeze']());
  const applied = auditEntry('Apply', r, plan, 'verified');
  assert.deepEqual(applied, { action: 'Apply', ruleId: 'journal-no-freeze', target: 'Journal settings', outcome: 'verified', changes: [{ field: 'FreezeOnError', before: 'false', after: 'true' }] });
  const rolledBack = auditEntry('Rollback', r, plan, 'failed', 'drift');
  assert.deepEqual(rolledBack.changes, [{ field: 'FreezeOnError', before: 'true', after: 'false' }]);
  assert.equal(rolledBack.detail, 'drift');
  assert.ok(!JSON.stringify(applied).includes('/j/'), 'raw settings are not copied into the audit record');
});
