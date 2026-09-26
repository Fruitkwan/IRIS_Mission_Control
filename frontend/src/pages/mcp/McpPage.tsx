import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bot, Copy, Plug, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Badge, Button, Card, CardHeader } from '../../components/ui';
import { useToast } from '../../components/toast-context';
import { fmtDate } from '../../lib/utils';

const MCP_URL = (import.meta.env.VITE_MCP_URL as string | undefined) ?? 'http://localhost:3333';

interface Status {
  name: string;
  version: string;
  uptime: number;
  irisUrl: string;
  iris: string;
  toolsAudited: number;
  transport: string;
  endpoint: string;
}
type AuditRow = Record<string, unknown>;

const get = async <T,>(path: string): Promise<T> => {
  const r = await fetch(MCP_URL + path);
  if (!r.ok) throw new Error(`MCP server unreachable (${r.status})`);
  return r.json();
};

export function McpPage() {
  const { toast } = useToast();
  const [showConfig, setShowConfig] = useState(false);
  const status = useQuery({ queryKey: ['mcp-status'], queryFn: () => get<Status>('/status'), refetchInterval: 15000, retry: false });
  const tools = useQuery({ queryKey: ['mcp-tools'], queryFn: () => get<string[]>('/tools'), enabled: !!status.data, retry: false });
  const audit = useQuery({ queryKey: ['mcp-audit'], queryFn: () => get<AuditRow[]>('/audit'), enabled: !!status.data, refetchInterval: 10000, retry: false });

  const s = status.data;
  const configSnippet = JSON.stringify(
    { mcpServers: { irisops: { url: `${MCP_URL}/mcp` } } },
    null,
    2,
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="MCP Server"
        description="Model Context Protocol endpoint exposing read-only IRIS administration tools to AI clients"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowConfig((v) => !v)}>
              <Plug className="h-3.5 w-3.5" /> Client setup
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { status.refetch(); audit.refetch(); }}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </>
        }
      />

      {showConfig && (
        <Card className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-sm font-semibold mb-1">Connect an MCP client</h4>
              <p className="text-xs text-ink-400 mb-2">
                Add this to your client's MCP configuration (Claude Desktop, Cursor, VS Code, mcp-remote…):
              </p>
              <pre className="rounded-md bg-ink-950 border border-ink-700 p-3 text-xs font-mono text-ink-200 overflow-x-auto">{configSnippet}</pre>
            </div>
            <Button
              variant="ghost" size="sm"
              onClick={() => { navigator.clipboard.writeText(configSnippet); toast('ok', 'Config copied'); }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-ink-400 mb-1"><Bot className="h-3.5 w-3.5" /> Server</div>
          {status.isError ? (
            <>
              <Badge tone="red">offline</Badge>
              <p className="mt-2 text-xs text-ink-500">
                Not reachable at {MCP_URL}. Start it with <code className="text-ink-300">cd mcp-server && npm start</code> or <code className="text-ink-300">docker compose up</code>.
              </p>
            </>
          ) : (
            <>
              <Badge tone="green">online</Badge>
              <p className="mt-2 text-xs text-ink-400 font-mono">{MCP_URL}/mcp</p>
            </>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-ink-400 mb-1">IRIS connection</div>
          {s ? (
            <>
              <Badge tone={s.iris === 'connected' ? 'green' : 'red'}>{s.iris === 'connected' ? 'connected' : 'error'}</Badge>
              <p className="mt-2 text-xs text-ink-400 font-mono break-all">{s.irisUrl}</p>
            </>
          ) : (
            <span className="text-xs text-ink-500">—</span>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-ink-400 mb-1">Activity</div>
          <div className="text-2xl font-semibold">{s?.toolsAudited ?? 0}</div>
          <p className="text-xs text-ink-500">tool calls audited · uptime {s ? Math.round(s.uptime / 1000) + 's' : '—'}</p>
        </Card>
      </div>

      <Card>
        <CardHeader title="Available tools" subtitle="Read-only — mutating actions are deliberately excluded" />
        <div className="flex flex-wrap gap-2 p-4">
          {(tools.data ?? []).map((t) => (
            <Badge key={t} tone="teal" className="font-mono">{t}</Badge>
          ))}
          {status.isError && <span className="text-xs text-ink-500">Start the MCP server to list tools.</span>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Tool call audit" subtitle="Every MCP call is logged with sanitized arguments" />
        <DataTable<AuditRow>
          columns={[
            { key: 'ts', header: 'Time', render: (r) => <span className="text-xs text-ink-400">{fmtDate(String(r.ts))}</span> },
            { key: 'tool', header: 'Tool', className: 'font-mono text-xs' },
            { key: 'args', header: 'Arguments', render: (r) => <span className="font-mono text-[11px] text-ink-400">{JSON.stringify(r.args)}</span> },
            { key: 'durationMs', header: 'Duration', render: (r) => <span className="text-xs">{String(r.durationMs)} ms</span> },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'ok' ? 'green' : 'red'}>{String(r.status)}</Badge> },
          ]}
          rows={audit.data ?? []}
          loading={audit.isLoading && !status.isError}
          rowKey={(r, i) => String(r.ts) + i}
          empty={<span className="text-xs text-ink-500">No MCP calls recorded yet.</span>}
          dense
        />
      </Card>
    </div>
  );
}
