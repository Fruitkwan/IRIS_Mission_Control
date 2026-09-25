import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectFrom, errorMessage, unwrap } from '../src/health/collect.ts';
import { DIAGNOSTIC_SOURCES } from '../src/health/sources.ts';
import { evaluate, toReport } from '../src/health/rules.ts';

// Fixture responses keyed by SysAdmin API path, shaped like real /api/admin payloads.
const fixtures = {
  '/info': { result: { Version: 'IRIS for UNIX 2026.2' } },
  '/v2/monitor/dashboard/main': { result: { Alerts: { SeriousAlerts: 0 }, Status: { LastBackup: 'Never' } } },
  '/v2/databases': { result: [{ Name: 'USER', Status: 'Mounted', MountAtStartup: true }] },
  '/v2/security/audit/events': { result: [{ EventName: '%System/%Login/Login', Enabled: false }] },
  '/v2/journal/settings': { FreezeOnError: true, note: 'bare payload without envelope' },
};

const fakeGet = (failures = {}) => async (path) => {
  if (path in failures) throw failures[path];
  return path in fixtures ? fixtures[path] : { result: [] };
};

test('collects every diagnostic source and unwraps the SysAdmin envelope', async () => {
  const { telemetry, errors } = await collectFrom(fakeGet());
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.keys(telemetry).sort(), DIAGNOSTIC_SOURCES.map((s) => s.key).sort());
  assert.equal(telemetry.info.Version, 'IRIS for UNIX 2026.2');
  assert.deepEqual(telemetry.databases, fixtures['/v2/databases'].result);
  assert.deepEqual(telemetry.journalSettings, fixtures['/v2/journal/settings'], 'bare payloads pass through');
});

test('a failing collector is reported without blocking the others', async () => {
  const denied = Object.assign(new Error('Request failed'), { response: { status: 403, data: { status: { summary: 'ERROR #5: Not authorized' } } } });
  const { telemetry, errors } = await collectFrom(fakeGet({ '/v2/security/users': denied, '/v2/locks': new Error('socket hang up') }));
  assert.deepEqual(errors.sort((a, b) => a.collector.localeCompare(b.collector)), [
    { collector: 'locks', error: 'socket hang up' },
    { collector: 'users', error: 'ERROR #5: Not authorized' },
  ]);
  assert.equal(telemetry.users, undefined);
  assert.equal(telemetry.locks, undefined);
  assert.ok(telemetry.databases, 'other collectors still succeed');
});

test('progress is reported once per source', async () => {
  const seen = [];
  await collectFrom(fakeGet(), (done, total, name) => seen.push([done, total, name]));
  assert.equal(seen.length, DIAGNOSTIC_SOURCES.length);
  assert.deepEqual(seen.map(([d]) => d), DIAGNOSTIC_SOURCES.map((_, i) => i + 1));
  assert.ok(seen.every(([, total]) => total === DIAGNOSTIC_SOURCES.length));
});

test('collected fixtures flow through the rules engine into a report', async () => {
  const { telemetry, errors } = await collectFrom(fakeGet({ '/v2/processes': new Error('timeout') }));
  const report = toReport(evaluate(telemetry), errors);
  assert.deepEqual(report.findings.map((f) => f.ruleId).sort(), ['audit-login-off', 'no-backup']);
  assert.deepEqual(report.collectorErrors, [{ collector: 'processes', error: 'timeout' }]);
});

test('error messages prefer IRIS summaries, then HTTP status, then message', () => {
  assert.equal(errorMessage({ response: { status: 500, data: { status: { summary: 'ERROR #5002' } } } }), 'ERROR #5002');
  assert.equal(errorMessage({ response: { status: 401 } }), 'HTTP 401');
  assert.equal(errorMessage(new Error('IRIS 404: not found')), 'IRIS 404: not found');
  assert.equal(errorMessage(undefined), 'request failed');
});

test('unwrap keeps falsy but present results', () => {
  assert.deepEqual(unwrap({ result: [] }), []);
  assert.equal(unwrap({ result: 0 }), 0);
  assert.equal(unwrap(null), null);
});
