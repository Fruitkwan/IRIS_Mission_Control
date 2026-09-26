import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffConfigs, latestFixPair } from '../src/observability/diff.ts';

// Newest first, as the snapshot API returns them.
const before = { id: '1', fix: 'Enable journal freeze-on-error', phase: 'before' };
const after = { id: '2', fix: 'Enable journal freeze-on-error', phase: 'after' };

test('Time Machine preselects the before/after pair of the latest verified fix', () => {
  assert.deepEqual(latestFixPair([after, before, { id: '0' }]), [before, after]);
});

test('no preselection unless the two newest snapshots bracket the same fix', () => {
  assert.equal(latestFixPair([]), null);
  assert.equal(latestFixPair([{ id: '3' }, after, before]), null, 'a manual snapshot came after the fix');
  assert.equal(latestFixPair([after, { ...before, fix: 'Resume this task' }]), null, 'different fixes');
  assert.equal(latestFixPair([before, after]), null, 'wrong order');
});

test('config drift reports added, removed and changed items by name', () => {
  const a = { data: { users: [{ Name: 'alice', Enabled: true }, { Name: 'bob' }], journal: { FreezeOnError: false } } };
  const b = { data: { users: [{ Name: 'alice', Enabled: false }, { Name: 'carol' }], journal: { FreezeOnError: true } } };
  const lines = diffConfigs(a, b).map((l) => `${l.section} ${l.kind} ${l.text.split(':')[0]}`);
  assert.deepEqual(lines.sort(), ['journal ~ configuration changed', 'users + carol', 'users - bob', 'users ~ alice changed'].sort());
});

test('identical snapshots, and summaries without data, show no drift', () => {
  const snap = { data: { roles: [{ Name: '%All' }] } };
  assert.deepEqual(diffConfigs(snap, structuredClone(snap)), []);
  assert.deepEqual(diffConfigs({}, {}), []);
});
