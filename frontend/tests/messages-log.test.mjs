import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterEntries, parseLines } from '../src/logs/parse.ts';

// Real messages.log lines from IRIS 2026.2.
const lines = [
  '09/22/26-19:19:48:654 (460) 1 [Utility.Event] Configuration file /usr/irissys/iris.cpf is not the same as when last shut down',
  '09/22/26-19:20:24:169 (467) 2 [Utility.Event] System appears to have failed over from node buildkitsandbox',
  '09/22/26-19:20:24:447 (467) 1 [Generic.Event] Warning: Alternate and primary journal directories are the same',
  '09/26/26-18:58:51:837 (1041) 0 [IrisOps.CloudBroker] [irisops-cloud] request=1041-68328 stage=vault-get outcome=ok',
  '09/26/26-19:00:00:000 (12) 3 [Generic.Event] Fatal: write daemon stopped',
  '    continuation line of the fatal entry',
];

test('parses time, pid, severity, source and text', () => {
  const [first] = parseLines(lines);
  assert.deepEqual(first, {
    time: '09/22/26-19:19:48:654', pid: '460', severity: 'warning', source: 'Utility.Event',
    text: 'Configuration file /usr/irissys/iris.cpf is not the same as when last shut down',
  });
  assert.deepEqual(parseLines(lines).map((e) => e.severity), ['warning', 'severe', 'warning', 'info', 'fatal']);
});

test('keeps bracketed text inside the message and joins continuation lines', () => {
  const entries = parseLines(lines);
  assert.equal(entries[3].source, 'IrisOps.CloudBroker');
  assert.match(entries[3].text, /^\[irisops-cloud\] request=/);
  assert.equal(entries[4].text, 'Fatal: write daemon stopped\n    continuation line of the fatal entry');
});

test('text before the first entry is kept rather than dropped', () => {
  const [entry] = parseLines(['(truncated start of file)', lines[0]]);
  assert.deepEqual(entry, { severity: 'info', text: '(truncated start of file)' });
});

test('filters by minimum severity and by text or source, case-insensitively', () => {
  const entries = parseLines(lines);
  assert.equal(filterEntries(entries, 'info', '').length, 5);
  assert.deepEqual(filterEntries(entries, 'severe', '').map((e) => e.severity), ['severe', 'fatal']);
  assert.equal(filterEntries(entries, 'info', 'FAILED OVER').length, 1);
  assert.equal(filterEntries(entries, 'info', 'cloudbroker').length, 1, 'matches the source');
  assert.equal(filterEntries(entries, 'severe', 'journal').length, 0, 'both filters apply');
});
