import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitize } from '../src/sanitize.mts';

test('secret-looking argument keys are redacted from the MCP audit log', () => {
  assert.deepEqual(sanitize({ name: 'USER', password: 'SYS', apiKey: 'k', accessToken: 't', clientSecret: 's', Authorization: 'Basic x' }), {
    name: 'USER', password: '***', apiKey: '***', accessToken: '***', clientSecret: '***', Authorization: '***',
  });
});

test('redaction reaches nested objects and arrays', () => {
  const out = sanitize({ config: { user: 'a', Password: 'p' }, items: [{ token: 't', id: 1 }] });
  assert.deepEqual(out, { config: { user: 'a', Password: '***' }, items: [{ token: '***', id: 1 }] });
  assert.ok(!JSON.stringify(out).includes('"p"'));
});

test('non-secret values and primitives pass through unchanged', () => {
  assert.deepEqual(sanitize({ limit: 50, event_source: '%System', pid: 42, flag: false, nothing: null }), {
    limit: 50, event_source: '%System', pid: 42, flag: false, nothing: null,
  });
  assert.equal(sanitize(undefined), undefined);
  assert.equal(sanitize('text'), 'text');
});
