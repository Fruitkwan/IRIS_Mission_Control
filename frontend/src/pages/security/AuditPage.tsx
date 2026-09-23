import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { DataTable } from '../../components/DataTable';
import { Drawer, KeyValueGrid } from '../../components/DetailDrawer';
import { PageHeader } from '../../components/PageHeader';
import { Tabs } from '../../components/Tabs';
import { Button, Card, Input, Toggle } from '../../components/ui';
import { useToast, errText } from '../../components/toast';

type Row = Record<string, unknown>;

function AuditToggle() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({
    queryKey: ['audit-enabled'],
    queryFn: () => axios.get('/v2/security/audit/enabled', { timeout: 15000 }).then((r) => resultOf<Row>(r.data)),
    retry: false,
  });
  const enabled = Boolean(q.data?.Enabled);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-4 py-3">
      <Toggle
        checked={enabled}
        disabled={q.isLoading || !!q.error}
        onChange={async (v) => {
          try {
            await axios.put('/v2/security/audit/enabled', { Enabled: v });
            toast('ok', `Audit ${v ? 'enabled' : 'disabled'}`);
            qc.invalidateQueries({ queryKey: ['audit-enabled'] });
          } catch (e) {
            toast('err', errText(e));
          }
        }}
      />
      <div>
        <div className="text-sm font-medium">Audit logging {q.error ? 'status unavailable' : enabled ? 'enabled' : 'disabled'}</div>
        <div className="text-xs text-ink-500">{q.error ? `Could not read audit status: ${errText(q.error)}` : 'Master switch for the IRIS audit database'}</div>
      </div>
    </div>
  );
}

function AuditEvents() {
  const q = useQuery({
    queryKey: ['audit-events'],
    queryFn: () => axios.get('/v2/security/audit/events', { timeout: 15000 }).then((r) => resultOf<Row[]>(r.data) ?? []),
    retry: false,
  });
  const rows = q.data ?? [];
  const qc = useQueryClient();
  const { toast } = useToast();
  return (
    <DataTable
      columns={[
        {
          key: 'Enabled',
          header: 'On',
          className: 'w-px',
          render: (r) => (
            <Toggle
              checked={Boolean(r.Enabled)}
              onChange={async (v) => {
                const [source, type, name] = String(r.EventName).split('/');
                try {
                  await axios.put(
                    '/v2/security/audit/event',
                    { Enabled: v },
                    { params: { source, type, name } },
                  );
                  toast('ok', `${name} ${v ? 'enabled' : 'disabled'}`);
                  qc.invalidateQueries();
                } catch (e) {
                  toast('err', errText(e));
                }
              }}
            />
          ),
          searchable: false,
        },
        { key: 'EventName', header: 'Event', className: 'font-mono text-xs' },
        { key: 'Total', header: 'Total', sortValue: (r) => Number(r.Total ?? 0), className: 'text-right font-mono text-xs' },
        { key: 'Written', header: 'Written', sortValue: (r) => Number(r.Written ?? 0), className: 'text-right font-mono text-xs' },
        { key: 'Lost', header: 'Lost', sortValue: (r) => Number(r.Lost ?? 0), className: 'text-right font-mono text-xs', render: (r) => <span className={Number(r.Lost) ? 'text-red-400' : ''}>{String(r.Lost ?? 0)}</span> },
      ]}
      rows={rows}
      loading={q.isLoading}
      error={q.error}
      onRetry={() => q.refetch()}
      rowKey={(r) => String(r.EventName)}
      dense
      searchPlaceholder="Filter events…"
    />
  );
}

function AuditRecords() {
  const [filter, setFilter] = useState({ source: '', type: '', name: '', utcTimestamp: '' });
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [record, setRecord] = useState<Row | null>(null);

  const search = async () => {
    setBusy(true);
    setErr('');
    try {
      const body: Record<string, unknown> = {};
      if (filter.source) body.source = filter.source;
      if (filter.type) body.type = filter.type;
      if (filter.name) body.name = filter.name;
      if (filter.utcTimestamp) body.utcTimestamp = filter.utcTimestamp;
      const { data } = await axios.post('/v2/security/audit/records', body);
      const res = resultOf<Row[] | Row>(data);
      setRows(Array.isArray(res) ? res : res ? [res] : []);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        {(['source', 'type', 'name', 'utcTimestamp'] as const).map((k) => (
          <div key={k}>
            <label className="mb-1 block text-[11px] text-ink-400">{k}</label>
            <Input
              value={filter[k]}
              onChange={(e) => setFilter((f) => ({ ...f, [k]: e.target.value }))}
              placeholder={k === 'utcTimestamp' ? '2026-09-19 16:00:00' : k}
              className="h-8 text-xs"
            />
          </div>
        ))}
        <div className="col-span-full">
          <Button size="sm" loading={busy} onClick={search}>
            Search audit records
          </Button>
        </div>
      </Card>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {rows && (
        <DataTable
          columns={Object.keys(rows[0] ?? { empty: '' }).slice(0, 8).map((k) => ({
            key: k,
            header: k,
            render: (r: Row) => (
              <span className="font-mono text-xs">
                {typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k] ?? '—')}
              </span>
            ),
          }))}
          rows={rows}
          rowKey={(_, i) => String(i)}
          onRowClick={setRecord}
          dense
        />
      )}
      <Drawer open={!!record} onClose={() => setRecord(null)} title="Audit record">
        {record && <KeyValueGrid data={record} />}
      </Drawer>
    </div>
  );
}

export function AuditPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Audit" description="Audit database: master switch, events, and records" />
      <AuditToggle />
      <Tabs
        tabs={[
          { id: 'events', label: 'Events', content: <AuditEvents /> },
          { id: 'records', label: 'Records', content: <AuditRecords /> },
        ]}
      />
    </div>
  );
}
