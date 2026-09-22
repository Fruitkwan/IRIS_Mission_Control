import { useMemo, useState } from 'react';
import { ChevronRight, Copy, Play, Search } from 'lucide-react';
import { axios } from '../api/axios-instance';
import { Badge, Button, Card, Input, Textarea } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { SchemaForm } from '../components/SchemaForm';
import { apiSpec, opQueryParams, resolveSchema, type OperationObject } from '../lib/spec';
import { cn } from '../lib/utils';
import { useToast } from '../components/toast';

type OpEntry = { method: string; path: string; op: OperationObject; tag: string };

const METHOD_TONE: Record<string, string> = {
  get: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  post: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  put: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  delete: 'bg-red-500/15 text-red-400 border-red-500/30',
  head: 'bg-ink-700 text-ink-300 border-ink-600',
};

export function ApiExplorerPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState('');
  const [sel, setSel] = useState<OpEntry | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [body, setBody] = useState<Record<string, unknown>>({});
  const [bodyRaw, setBodyRaw] = useState('');
  const [useRaw, setUseRaw] = useState(false);
  const [resp, setResp] = useState<{ status: number; ms: number; data: unknown } | null>(null);
  const [busy, setBusy] = useState(false);

  const ops = useMemo(() => {
    const out: OpEntry[] = [];
    for (const [path, methods] of Object.entries(apiSpec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (!['get', 'post', 'put', 'delete', 'head'].includes(method) || Array.isArray(op)) continue;
        out.push({ method, path, op: op as OperationObject, tag: (op as OperationObject).tags?.[0] ?? 'general' });
      }
    }
    return out;
  }, []);

  const grouped = useMemo(() => {
    const f = filter.toLowerCase();
    const map = new Map<string, OpEntry[]>();
    for (const e of ops) {
      if (f && !`${e.method} ${e.path} ${e.op.summary ?? ''}`.toLowerCase().includes(f)) continue;
      if (!map.has(e.tag)) map.set(e.tag, []);
      map.get(e.tag)!.push(e);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [ops, filter]);

  const queryParams = sel ? opQueryParams(sel.path, sel.op) : [];
  const bodySchema = sel
    ? resolveSchema(sel.op.requestBody?.content?.['application/json']?.schema)
    : undefined;

  const send = async () => {
    if (!sel) return;
    setBusy(true);
    setResp(null);
    const t0 = performance.now();
    try {
      const qp: Record<string, string> = {};
      for (const p of queryParams) if (params[p.name] !== '' && params[p.name] != null) qp[p.name] = params[p.name];
      const payload = useRaw ? (bodyRaw.trim() ? JSON.parse(bodyRaw) : undefined) : Object.keys(body).length ? body : undefined;
      const r = await axios.request({
        method: sel.method,
        url: sel.path,
        params: qp,
        data: payload,
      });
      setResp({ status: r.status, ms: Math.round(performance.now() - t0), data: r.data });
    } catch (e) {
      const err = e as { response?: { status?: number; data?: unknown }; message?: string };
      setResp({
        status: err.response?.status ?? 0,
        ms: Math.round(performance.now() - t0),
        data: err.response?.data ?? { error: err.message },
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="API Explorer"
        description="Live console for the IRIS SysAdmin REST API — every endpoint, authenticated"
      />
      <div className="flex min-h-0 flex-1 gap-4">
        {/* operation list */}
        <Card className="flex w-80 shrink-0 flex-col overflow-hidden">
          <div className="border-b border-ink-700 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-500" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`${ops.length} endpoints…`}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {grouped.map(([tag, entries]) => (
              <div key={tag} className="mb-2">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  {tag}
                </div>
                {entries.map((e) => (
                  <button
                    key={e.method + e.path}
                    onClick={() => {
                      setSel(e);
                      setParams({});
                      setBody({});
                      setBodyRaw('');
                      setResp(null);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1 text-left',
                      sel === e ? 'bg-accent-600/15' : 'hover:bg-ink-800',
                    )}
                  >
                    <span
                      className={cn(
                        'w-11 shrink-0 rounded border px-1 text-center font-mono text-[9px] font-bold uppercase',
                        METHOD_TONE[e.method],
                      )}
                    >
                      {e.method}
                    </span>
                    <span className="truncate font-mono text-[11px] text-ink-200">{e.path}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Card>

        {/* detail */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          {!sel ? (
            <Card className="flex h-full items-center justify-center text-sm text-ink-500">
              <div className="text-center">
                <ChevronRight className="mx-auto mb-2 h-6 w-6" />
                Select an endpoint to inspect and call it
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <span className={cn('rounded border px-2 py-1 font-mono text-xs font-bold uppercase', METHOD_TONE[sel.method])}>
                    {sel.method}
                  </span>
                  <code className="text-sm text-ink-100">/api/admin{sel.path}</code>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(`${sel.method.toUpperCase()} /api/admin${sel.path}`);
                      toast('ok', 'Copied');
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                {sel.op.summary && <p className="mt-2 text-xs text-ink-400">{sel.op.summary}</p>}
              </Card>

              {queryParams.length > 0 && (
                <Card className="p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">Query parameters</p>
                  <div className="grid grid-cols-2 gap-3">
                    {queryParams.map((p) => (
                      <div key={p.name}>
                        <label className="mb-1 block text-[11px] text-ink-300">
                          {p.name}
                          {p.required && <span className="text-red-400"> *</span>}
                        </label>
                        <Input
                          className="h-8 text-xs"
                          value={params[p.name] ?? ''}
                          onChange={(e) => setParams((s) => ({ ...s, [p.name]: e.target.value }))}
                          placeholder={p.description ?? (p.example != null ? String(p.example) : '')}
                        />
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {(bodySchema?.properties || sel.method !== 'get') && sel.method !== 'get' && sel.method !== 'head' && (
                <Card className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Request body</p>
                    <label className="flex items-center gap-1.5 text-[11px] text-ink-400">
                      <input type="checkbox" checked={useRaw} onChange={(e) => setUseRaw(e.target.checked)} className="accent-teal-500" />
                      raw JSON
                    </label>
                  </div>
                  {useRaw || !bodySchema?.properties ? (
                    <Textarea rows={6} value={bodyRaw} onChange={(e) => setBodyRaw(e.target.value)} placeholder="{ }" />
                  ) : (
                    <SchemaForm schema={bodySchema} value={body} onChange={setBody} />
                  )}
                </Card>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={send} loading={busy}>
                  <Play className="h-3.5 w-3.5" /> Send request
                </Button>
                {resp && (
                  <Badge tone={resp.status < 300 ? 'green' : resp.status < 500 ? 'amber' : 'red'}>
                    {resp.status || 'ERR'} · {resp.ms}ms
                  </Badge>
                )}
              </div>

              {resp && (
                <Card>
                  <div className="border-b border-ink-700 px-3 py-2 text-xs font-semibold text-ink-400">
                    Response
                  </div>
                  <pre className="max-h-[480px] overflow-auto p-3 font-mono text-[11px] leading-relaxed text-ink-200">
                    {JSON.stringify(resp.data, null, 2)}
                  </pre>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
