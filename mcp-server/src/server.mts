// IrisOps MCP server — exposes read-only IRIS administration tools to any
// MCP-compatible client (Claude, ChatGPT, IDEs, agents) over Streamable HTTP.
// All tools execute against the same /api/admin SysAdmin APIs the portal uses,
// and share the portal's rules engine for health findings.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { api, IRIS_URL } from './iris.mts';
// Reuse the portal's deterministic rules engine (pure TS, type-stripped at runtime).
import { evaluate, toReport } from '../../frontend/src/health/rules.ts';

const PORT = Number(process.env.MCP_PORT ?? 3333);
const startedAt = Date.now();

// ---- audit ring buffer (sanitized — arguments have secrets stripped) ----
const SECRET_KEYS = /pass|secret|token|key|credential/i;
const audit: Record<string, unknown>[] = [];
function auditCall(client: string, tool: string, args: unknown, ms: number, err?: string) {
  const sanitized = Object.fromEntries(
    Object.entries((args ?? {}) as Record<string, unknown>).map(([k, v]) => [
      k,
      SECRET_KEYS.test(k) ? '***' : v,
    ]),
  );
  audit.unshift({
    ts: new Date().toISOString(),
    client,
    tool,
    args: sanitized,
    durationMs: ms,
    status: err ? 'error' : 'ok',
    error: err,
  });
  if (audit.length > 200) audit.pop();
}

const json = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
});

function buildServer() {
  const server = new McpServer({ name: 'irisops', version: '0.1.0' });
  const tool = <T extends z.ZodRawShape>(
    name: string,
    description: string,
    schema: T,
    fn: (args: z.infer<z.ZodObject<T>>) => Promise<unknown>,
  ) =>
    server.registerTool(name, { description, inputSchema: schema }, async (args) => {
      const t0 = Date.now();
      try {
        const data = await fn(args as z.infer<z.ZodObject<T>>);
        auditCall('mcp', name, args, Date.now() - t0);
        return json(data);
      } catch (e) {
        auditCall('mcp', name, args, Date.now() - t0, String(e));
        return { content: [{ type: 'text' as const, text: `Error: ${String(e)}` }], isError: true };
      }
    });

  tool('iris_get_health', 'IRIS Ops rule-based configuration assessment and evidence-backed findings; scores are not InterSystems health metrics', {}, async () => {
    const paths = {
      dashboard: '/v2/monitor/dashboard/main',
      databases: '/v2/databases',
      processes: '/v2/processes',
      locks: '/v2/locks',
      tasks: '/v2/tasks',
      users: '/v2/security/users',
      services: '/v2/security/services',
      webApps: '/v2/web-apps',
      journalSettings: '/v2/journal/settings',
      auditEvents: '/v2/security/audit/events',
      x509: '/v2/security/x509-credentials',
    };
    const telemetry: Record<string, unknown> = {};
    const errors: { collector: string; error: string }[] = [];
    await Promise.all(
      Object.entries(paths).map(async ([k, p]) => {
        try {
          telemetry[k] = await api(p);
        } catch (e) {
          errors.push({ collector: k, error: String(e) });
        }
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const report = toReport(evaluate(telemetry as any), errors);
    return report;
  });

  tool('iris_list_databases', 'List IRIS databases with mount status and directory', {}, () => api('/v2/databases'));
  tool('iris_get_database', 'Get details for one database by name', { name: z.string() }, ({ name }) =>
    api('/v2/database', { params: { name } }));
  tool('iris_list_namespaces', 'List namespaces', {}, () => api('/v2/namespaces'));
  tool('iris_list_processes', 'List running IRIS processes (pid, routine, state, cpu, elapsed)', {}, () =>
    api('/v2/processes'));
  tool('iris_get_process', 'Get details for a process by pid', { pid: z.number() }, ({ pid }) =>
    api('/v2/process', { params: { id: String(pid) } }));
  tool('iris_list_locks', 'List currently held locks', {}, () => api('/v2/locks'));
  tool('iris_get_system_usage', 'System usage snapshot: db/journal space, lock table, processes, busy processes', {}, () =>
    api('/v2/monitor/system-usage'));
  tool('iris_get_dashboard', 'Main monitor dashboard: performance, ECP, alerts, licensing, upcoming tasks', {}, () =>
    api('/v2/monitor/dashboard/main'));
  tool('iris_get_audit_events', 'Recent audit records, optionally filtered by event source', {
    event_source: z.string().optional(),
    limit: z.number().default(50),
  }, ({ event_source, limit }) =>
    api('/v2/security/audit/records', {
      method: 'POST',
      body: { event_source, limit },
    }));
  tool('iris_list_users', 'List security users', {}, () => api('/v2/security/users'));
  tool('iris_list_roles', 'List security roles', {}, () => api('/v2/security/roles'));
  tool('iris_list_web_apps', 'List configured web applications with auth methods', {}, () => api('/v2/web-apps'));
  tool('iris_list_tasks', 'List scheduled tasks', {}, () => api('/v2/tasks'));
  tool('iris_get_license', 'License usage and limits', {}, () => api('/v2/license/usage'));
  tool('iris_get_certificates', 'X.509 credential metadata (no private material)', {}, () =>
    api('/v2/security/x509-credentials'));

  // MCP resources
  server.registerResource('health', 'iris://health', { description: 'Current health report' }, async () => ({
    contents: [{ uri: 'iris://health', mimeType: 'application/json', text: 'Run iris_get_health for the full report' }],
  }));

  return server;
}

const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id, authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.writeHead(204).end();

  const url = new URL(req.url ?? '/', `http://x`);

  // Status endpoints for the portal UI (read-only metadata)
  if (url.pathname === '/status') {
    let iris: string;
    try {
      await api('/info');
      iris = 'connected';
    } catch (e) {
      iris = `error: ${e}`;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      name: 'irisops-mcp', version: '0.1.0', uptime: Date.now() - startedAt,
      irisUrl: IRIS_URL, iris, toolsAudited: audit.length,
      transport: 'streamable-http', endpoint: '/mcp',
    }));
  }
  if (url.pathname === '/audit') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(audit.slice(0, 100)));
  }
  if (url.pathname === '/tools') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(TOOL_MANIFEST));
  }

  if (url.pathname === '/mcp') {
    // Stateless streamable HTTP: a fresh server+transport per request.
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => transport.close());
    await server.connect(transport);
    let body = '';
    req.on('data', (c) => (body += c));
    await new Promise<void>((r) => req.on('end', () => r()));
    await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
    return;
  }

  res.writeHead(404).end('not found');
});

const TOOL_MANIFEST = [
  'iris_get_health', 'iris_list_databases', 'iris_get_database', 'iris_list_namespaces',
  'iris_list_processes', 'iris_get_process', 'iris_list_locks', 'iris_get_system_usage',
  'iris_get_dashboard', 'iris_get_audit_events', 'iris_list_users', 'iris_list_roles',
  'iris_list_web_apps', 'iris_list_tasks', 'iris_get_license', 'iris_get_certificates',
];

http.listen(PORT, () => {
  console.log(`[irisops-mcp] streamable HTTP listening on :${PORT}/mcp, IRIS=${IRIS_URL}`);
});
