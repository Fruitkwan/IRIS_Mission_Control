import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate, toReport } from '../src/health/rules.ts';

test('optional unmounted databases are reported without claiming an outage', () => {
  const [finding] = evaluate({ databases: [{ Name: 'IPM', Status: 'Unmounted', MountRequired: false }] });
  assert.equal(finding.ruleId, 'db-not-mounted');
  assert.equal(finding.severity, 'info');
  assert.match(finding.description, /may be intentional/);
  const [required] = evaluate({ databases: [{ Name: 'APP', Status: 'Unmounted', MountRequired: true }] });
  assert.equal(required.severity, 'critical');
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

test('repeated resources do not each deduct the full rule penalty', () => {
  const app = (name) => ({ Name: name, Enabled: true, AuthenticationMethods: ['Unauthenticated'] });
  const one = toReport(evaluate({ webApps: [app('/a')] }), []);
  const three = toReport(evaluate({ webApps: [app('/a'), app('/b'), app('/c')] }), []);
  assert.equal(three.findings.length, 3);
  assert.equal(three.scores.find((score) => score.category === 'security').score,
    one.scores.find((score) => score.category === 'security').score);
  assert.match(three.scoreMethod, /not an InterSystems health metric/);
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
