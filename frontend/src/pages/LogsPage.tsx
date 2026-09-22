import { useMemo, useSyncExternalStore, useState } from 'react';
import { Layers, Trash2 } from 'lucide-react';
import { activityLog, axios, type ApiActivity } from '../api/axios-instance';
import { resultOf } from '../api/helpers';
import { DataTable } from '../components/DataTable';
import { Drawer, KeyValueGrid } from '../components/DetailDrawer';
import { PageHeader } from '../components/PageHeader';
import { Tabs } from '../components/Tabs';
import { Badge, Button, Card } from '../components/ui';
import { fmtDate, cn } from '../lib/utils';
import { useGetTaskHistory } from '../api/generated/task/task';
import { useGetJournalFiles } from '../api/generated/journal/journal';
import { useGetAsyncResults } from '../api/generated/async-result/async-result';

type Row = Record<string, unknown>;

const STATUS_TONE = (s?: number) =>
  s == null ? 'neutral' : s < 300 ? 'green' : s < 500 ? 'amber' : 'red';

function ApiActivityStream() {
  const rows = useSyncExternalStore(
    (cb) => activityLog.subscribe(cb),
    () => activityLog.list(),
  );
  const [sel, setSel] = useState<ApiActivity | null>(null);
  const [grouped, setGrouped] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'ok' | 'err'>('all');

  const filtered = useMemo(
    () =>
      rows.filter((a) =>
        statusFilter === 'all' ? true : statusFilter === 'ok' ? (a.status ?? 0) < 400 : (a.status ?? 500) >= 400,
      ),
    [rows, statusFilter],
  );

  // Incident grouping: repeated method+path+status in the recent window.
  const incidents = useMemo(() => {
    if (!grouped) return [];
    const map = new Map<string, ApiActivity[]>();
    for (const a of filtered) {
      const key = `${a.method} ${a.url.split('?')[0]} ${a.status ?? 'ERR'}`;
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()]
      .filter(([, v]) => v.length >= 3)
      .map(([key, v]) => ({
        key,
        count: v.length,
        first: v[v.length - 1].ts,
        last: v[0].ts,
        status: v[0].status,
        rows: v,
      }))
      .sort((x, y) => y.count - x.count);
  }, [filtered, grouped]);

  const incidentKeys = new Set(incidents.map((i) => i.key));
  const visible = grouped ? filtered.filter((a) => !incidentKeys.has(`${a.method} ${a.url.split('?')[0]} ${a.status ?? 'ERR'}`)) : filtered;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-ink-500">
          Every request this portal makes, with server-reported console output. Newest first.
        </p>
        <div className="flex items-center gap-2">
          {(['all', 'ok', 'err'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px]',
                statusFilter === s ? 'border-accent-500 text-accent-300' : 'border-ink-700 text-ink-500',
              )}
            >
              {s}
            </button>
          ))}
          <Button size="xs" variant={grouped ? 'default' : 'outline'} onClick={() => setGrouped((v) => !v)}>
            <Layers className="h-3 w-3" /> Group incidents
          </Button>
          <Button size="xs" variant="ghost" onClick={() => activityLog.clear()}>
            <Trash2 className="h-3 w-3" /> Clear
          </Button>
        </div>
      </div>

      {grouped && incidents.length > 0 && (
        <div className="space-y-2">
          {incidents.map((inc) => (
            <Card key={inc.key} className="p-3">
              <div className="flex items-center gap-3">
                <Badge tone="amber">{inc.count}× repeated</Badge>
                <span className="font-mono text-xs text-ink-200 truncate">{inc.key}</span>
                <span className="ml-auto text-[11px] text-ink-500">
                  {new Date(inc.first).toLocaleTimeString('en-GB')} → {new Date(inc.last).toLocaleTimeString('en-GB')}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="max-h-[60vh] overflow-auto font-mono text-[11px]">
          {visible.map((a) => (
            <button
              key={a.id}
              onClick={() => setSel(a)}
              className="flex w-full items-center gap-3 border-b border-ink-800/50 px-3 py-1.5 text-left hover:bg-ink-800/50"
            >
              <span className="w-20 shrink-0 text-ink-500">
                {new Date(a.ts).toLocaleTimeString('en-GB')}
              </span>
              <span
                className={cn(
                  'w-10 shrink-0 font-bold',
                  a.method === 'GET'
                    ? 'text-blue-400'
                    : a.method === 'POST'
                      ? 'text-emerald-400'
                      : a.method === 'PUT'
                        ? 'text-amber-400'
                        : 'text-red-400',
                )}
              >
                {a.method}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-200">{a.url}</span>
              {a.console?.length ? (
                <Badge tone="purple" className="shrink-0">console {a.console.length}</Badge>
              ) : null}
              <Badge tone={STATUS_TONE(a.status)} className="w-14 shrink-0 justify-center">
                {a.status ?? 'ERR'}
              </Badge>
              <span className="w-14 shrink-0 text-right text-ink-500">{a.ms != null ? `${a.ms}ms` : ''}</span>
            </button>
          ))}
          {visible.length === 0 && (
            <p className="py-10 text-center text-xs text-ink-500">
              {rows.length === 0 ? 'No API activity yet — navigate around and come back.' : 'Nothing matches the current filter.'}
            </p>
          )}
        </div>
      </Card>
      <Drawer open={!!sel} onClose={() => setSel(null)} title={sel ? `${sel.method} ${sel.url}` : ''} wide>
        {sel && (
          <div className="space-y-4">
            <KeyValueGrid
              data={{
                time: new Date(sel.ts).toISOString(),
                status: sel.status,
                durationMs: sel.ms,
                error: sel.error,
              }}
            />
            {sel.console && sel.console.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold text-ink-400">Server console output</p>
                <pre className="rounded-md bg-ink-850 p-3 text-xs text-amber-200/90 whitespace-pre-wrap">
                  {sel.console.join('\n')}
                </pre>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function AuditLog() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <div className="space-y-3">
      <Button
        size="sm"
        variant="outline"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const { data } = await axios.post('/v2/security/audit/records', {});
            const res = resultOf<Row[] | Row>(data);
            setRows(Array.isArray(res) ? res : res && Object.keys(res).length ? [res] : []);
            setErr('');
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Load recent audit records
      </Button>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {rows && rows.length === 0 && (
        <p className="text-xs text-ink-500">No audit records found (empty audit database or filter required).</p>
      )}
      {rows && rows.length > 0 && (
        <DataTable
          columns={Object.keys(rows[0]).slice(0, 8).map((k) => ({
            key: k,
            header: k,
            render: (r: Row) => <span className="font-mono text-xs">{typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k] ?? '—')}</span>,
          }))}
          rows={rows}
          rowKey={(_, i) => String(i)}
          dense
        />
      )}
    </div>
  );
}

function TaskLog() {
  const q = useGetTaskHistory();
  const rows = resultOf<Row[]>(q.data) ?? [];
  return (
    <DataTable
      columns={[
        { key: 'LogDatetime', header: 'Time', render: (r) => fmtDate(r.LogDatetime as string), className: 'font-mono text-xs' },
        { key: 'Name', header: 'Task' },
        { key: 'Namespace', header: 'NS' },
        { key: 'Status', header: 'Status', render: (r) => <Badge tone={r.Status === '1' ? 'green' : 'red'}>{r.Status === '1' ? 'ok' : String(r.Status)}</Badge> },
        { key: 'Result', header: 'Message', render: (r) => <span className="text-xs">{String(r.Result ?? '—')}</span> },
        { key: 'ErrNumber', header: 'Err', render: (r) => (Number(r.ErrNumber) ? <span className="font-mono text-xs text-red-400">{String(r.ErrNumber)}</span> : '') },
      ]}
      rows={rows}
      loading={q.isLoading}
      error={q.error}
      rowKey={(_, i) => String(i)}
      dense
    />
  );
}

function JournalLog() {
  const q = useGetJournalFiles();
  const rows = resultOf<Row[]>(q.data) ?? [];
  return (
    <DataTable
      columns={[
        { key: 'Name', header: 'Journal file', className: 'font-mono text-xs' },
        { key: 'CreationTime', header: 'Created', render: (r) => fmtDate(r.CreationTime as string) },
        { key: 'Reason', header: 'Reason' },
        { key: 'Size', header: 'Size' },
      ]}
      rows={rows}
      loading={q.isLoading}
      error={q.error}
      rowKey={(r) => String(r.Name)}
      dense
    />
  );
}

function AsyncOps() {
  const q = useGetAsyncResults();
  const rows = resultOf<Row[]>(q.data) ?? [];
  return (
    <DataTable
      columns={[
        { key: 'GUID', header: 'ID', className: 'font-mono text-xs', render: (r) => String(r.GUID ?? r.Id ?? '—') },
        { key: 'Status', header: 'Status', render: (r) => <Badge tone="neutral">{String(r.Status ?? '—')}</Badge> },
        { key: 'Result', header: 'Result', render: (r) => <span className="font-mono text-xs">{String(r.Result ?? '—')}</span> },
      ]}
      rows={rows}
      loading={q.isLoading}
      error={q.error}
      rowKey={(r, i) => String(r.GUID ?? i)}
      dense
    />
  );
}

export function LogsPage() {
  return (
    <div>
      <PageHeader
        title="Log Console"
        description="Everything the server reports: API activity, audit records, task history, journal, async jobs"
      />
      <Tabs
        tabs={[
          { id: 'api', label: 'API Activity (live)', content: <ApiActivityStream /> },
          { id: 'audit', label: 'Audit Records', content: <AuditLog /> },
          { id: 'tasks', label: 'Task History', content: <TaskLog /> },
          { id: 'journal', label: 'Journal', content: <JournalLog /> },
          { id: 'async', label: 'Async Operations', content: <AsyncOps /> },
        ]}
      />
    </div>
  );
}
