// Injects operationIds into the SysAdmin OpenAPI spec so codegen produces
// predictable hook/function names. Reads spec/mainspec_v2.json, writes
// spec/mainspec_v2.with-ids.json
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(readFileSync(join(root, 'spec/mainspec_v2.json'), 'utf8'));

const SPECIAL = {
  'post /login': 'login',
  'post /logout': 'logout',
  'post /refresh': 'refresh',
  'post /revoke': 'revoke',
  'get /info': 'getInfo',
};

const pascal = (s) =>
  s
    .replace(/[{}]/g, '')
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

const seen = new Map();
const opId = (method, path) => {
  const special = SPECIAL[`${method} ${path}`];
  if (special) return special;
  const segs = path.split('/').filter(Boolean).filter((s) => s !== 'v2');
  let name = method + segs.map(pascal).join('');
  // path params -> ByX suffix for uniqueness/readability
  name = name.replace(/\{(\w+)\}/g, (_, p) => `By${pascal(p)}`);
  if (seen.has(name)) {
    const n = seen.get(name) + 1;
    seen.set(name, n);
    name = `${name}${n}`;
  } else {
    seen.set(name, 1);
  }
  return name;
};

let count = 0;
for (const [path, ops] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(ops)) {
    if (!['get', 'post', 'put', 'delete', 'patch', 'head'].includes(method)) continue;
    op.operationId = opId(method, path);
    count++;
    // Normalize tags: "/v2/security" -> "security" for clean codegen dirs
    if (Array.isArray(op.tags)) {
      op.tags = op.tags.map((t) => t.replace(/^\/?v2\//, '').replace(/^\//, '') || 'general');
    }
    // Fix malformed response headers (missing required `schema`)
    for (const res of Object.values(op.responses ?? {})) {
      for (const header of Object.values(res.headers ?? {})) {
        if (!header.schema && !header.content) header.schema = { type: 'string' };
      }
    }
  }
}

writeFileSync(
  join(root, 'spec/mainspec_v2.with-ids.json'),
  JSON.stringify(spec, null, 2),
);
console.log(`injected ${count} operationIds`);
