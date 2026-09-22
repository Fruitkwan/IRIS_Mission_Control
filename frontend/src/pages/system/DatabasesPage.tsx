import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { DataTable, type Column } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Tabs } from '../../components/Tabs';
import { Badge, Button, Input } from '../../components/ui';
import { useToast, errText } from '../../components/toast';
import { fmtBytes } from '../../lib/utils';
import { useGetDatabases } from '../../api/generated/database/database';
import { useGetDatabaseDirs } from '../../api/generated/database-dir/database-dir';
import { ResourcePage } from '../ResourcePage';

type Row = Record<string, unknown>;

function DatabaseDirs() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [sizeInput, setSizeInput] = useState<Record<string, string>>({});
  const q = useGetDatabaseDirs();
  const rows = resultOf<Row[]>(q.data) ?? [];
  const refresh = () => qc.invalidateQueries();

  const act = async (action: string, dir: string, extra?: Record<string, unknown>) => {
    try {
      const { data } = await axios.post(`/v2/database-dir/${action}`, null, {
        params: { dir, ...extra },
      });
      const res = resultOf<Record<string, unknown>>(data);
      toast('ok', `${action} → ${dir.split('/').slice(-2).join('/')}${res ? ` (${JSON.stringify(res).slice(0, 120)})` : ''}`);
      refresh();
    } catch (e) {
      toast('err', errText(e));
    }
  };

  const columns: Column<Row>[] = [
    { key: 'Directory', header: 'Directory', className: 'font-mono text-xs' },
    { key: 'SFN', header: 'SFN' },
    { key: 'Size', header: 'Size', render: (r) => fmtBytes(Number(r.Size) * 1024 * 1024), sortValue: (r) => Number(r.Size ?? 0) },
    { key: 'MaxSize', header: 'Max', render: (r) => (r.MaxSize ? fmtBytes(Number(r.MaxSize) * 1024 * 1024) : '∞') },
    { key: 'Status', header: 'Status', render: (r) => <Badge tone={r.Status === 'Mounted' || r.Status === 'RW' ? 'green' : 'amber'}>{String(r.Status ?? '—')}</Badge> },
    { key: 'Encrypted', header: 'Enc', render: (r) => (r.Encrypted ? <Badge tone="purple">yes</Badge> : '—') },
    { key: 'Mirrored', header: 'Mir', render: (r) => (r.Mirrored ? <Badge tone="blue">yes</Badge> : '—') },
    { key: 'Resource', header: 'Resource', render: (r) => String(r.Resource ?? '—') },
    {
      key: '__ops',
      header: 'Operations',
      searchable: false,
      className: 'w-px whitespace-nowrap',
      render: (r) => {
        const dir = String(r.Directory ?? '');
        return (
          <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="xs" variant="ghost" onClick={() => act('mount', dir)}>mount</Button>
            <Button size="xs" variant="ghost" onClick={() => act('dismount', dir)}>dismount</Button>
            <Button size="xs" variant="ghost" onClick={() => act('integrity-check', dir)}>integrity</Button>
            <Button size="xs" variant="ghost" onClick={() => act('compact', dir)}>compact</Button>
            <Button size="xs" variant="ghost" onClick={() => act('defragment', dir)}>defrag</Button>
            <Button size="xs" variant="ghost" onClick={() => act('truncate', dir)}>truncate</Button>
            <span className="inline-flex items-center gap-1">
              <Input
                className="h-6 w-16 px-1.5 text-[11px]"
                placeholder="MB"
                value={sizeInput[dir] ?? ''}
                onChange={(e) => setSizeInput((s) => ({ ...s, [dir]: e.target.value }))}
              />
              <Button
                size="xs"
                variant="ghost"
                disabled={!sizeInput[dir]}
                onClick={() => act('modify-size', dir, { size: Number(sizeInput[dir]) })}
              >
                resize
              </Button>
            </span>
          </div>
        );
      },
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      loading={q.isLoading}
      error={q.error}
      onRetry={refresh}
      rowKey={(r) => String(r.Directory)}
      dense
      searchPlaceholder="Filter directories…"
    />
  );
}

function Volumes() {
  // /v2/database-dir/volumes requires a dir — aggregate across all dirs.
  const dirs = useGetDatabaseDirs();
  const dirList = resultOf<Row[]>(dirs.data) ?? [];
  const q = useQuery({
    queryKey: ['all-volumes', dirList.length],
    enabled: dirList.length > 0,
    queryFn: async () => {
      const out: Row[] = [];
      await Promise.all(
        dirList.map(async (d) => {
          try {
            const { data } = await axios.get('/v2/database-dir/volumes', {
              params: { dir: d.Directory },
            });
            const res = resultOf<Row[] | Row>(data);
            const arr = Array.isArray(res) ? res : res ? [res] : [];
            arr.forEach((v) => out.push({ Directory: d.Directory, ...v }));
          } catch {
            /* skip dirs without volume info */
          }
        }),
      );
      return out;
    },
  });
  const rows = q.data ?? [];
  return (
    <DataTable
      columns={[
        { key: 'Directory', header: 'Volume', className: 'font-mono text-xs' },
        { key: 'Size', header: 'Size', render: (r) => fmtBytes(Number(r.Size)), sortValue: (r) => Number(r.Size ?? 0) },
        { key: 'FreeSpace', header: 'Free', render: (r) => fmtBytes(Number(r.FreeSpace)), sortValue: (r) => Number(r.FreeSpace ?? 0) },
        { key: 'Status', header: 'Status', render: (r) => <Badge tone="green">{String(r.Status ?? 'ok')}</Badge> },
        { key: 'FileSystem', header: 'FS', render: (r) => String(r.FileSystem ?? r.BlockSize ?? '—') },
      ]}
      rows={rows}
      loading={q.isLoading || dirs.isLoading}
      error={q.error}
      rowKey={(r, i) => String(r.Directory ?? i)}
      dense
    />
  );
}

export function DatabasesPage() {
  return (
    <div>
      <PageHeader title="Databases" description="Databases, directories and disk volumes" />
      <Tabs
        tabs={[
          {
            id: 'dbs',
            label: 'Databases',
            content: (
              <ResourcePage<Row>
                title=""
                listHook={useGetDatabases as never}
                singlePath="/v2/database"
                nameKey="Name"
                ops={{ get: 'getDatabase', update: 'putDatabase', delete: 'deleteDatabase', create: 'putDatabase' }}
                createMethod="put"
                createLabel="New database"
                columns={[
                  { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
                  { key: 'Directory', header: 'Directory', className: 'font-mono text-xs' },
                  { key: 'Server', header: 'Server', render: (r) => String(r.Server ?? 'local') },
                  { key: 'Status', header: 'Status', render: (r) => <Badge tone="green">{String(r.Status ?? '—')}</Badge> },
                  { key: 'MountAtStartup', header: 'Mount@boot', render: (r) => String(r.MountAtStartup ?? '—') },
                  { key: 'MountRequired', header: 'Required', render: (r) => String(r.MountRequired ?? '—') },
                ]}
              />
            ),
          },
          { id: 'dirs', label: 'Directories & Operations', content: <DatabaseDirs /> },
          { id: 'vols', label: 'Volumes', content: <Volumes /> },
        ]}
      />
    </div>
  );
}
