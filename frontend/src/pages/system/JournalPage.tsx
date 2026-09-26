import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, FileCheck, Repeat } from 'lucide-react';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { DataTable } from '../../components/DataTable';
import { Drawer, KeyValueGrid } from '../../components/DetailDrawer';
import { PageHeader } from '../../components/PageHeader';
import { SchemaForm } from '../../components/SchemaForm';
import { Tabs } from '../../components/Tabs';
import { Badge, Button, Card, CardHeader, PageLoader, ErrorState } from '../../components/ui';
import { useToast } from '../../components/toast-context';
import { errText } from '../../lib/errors';
import { requestSchema, resolveSchema } from '../../lib/spec';
import { fmtBytes, fmtDate } from '../../lib/utils';
import { useGetJournalFiles } from '../../api/generated/journal/journal';

type Row = Record<string, unknown>;

function JournalSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Row>({});
  const q = useQuery({
    queryKey: ['journal-settings'],
    queryFn: () => axios.get('/v2/journal/settings').then((r) => resultOf<Row>(r.data)),
  });
  const schema = resolveSchema(requestSchema('putJournalSettings'));
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => { setForm({ ...(q.data ?? {}) }); setEditing(true); }}>
          Edit settings
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await axios.post('/v2/journal/switch-file');
              toast('ok', 'Switched to a new journal file');
              qc.invalidateQueries();
            } catch (e) {
              toast('err', errText(e));
            }
          }}
        >
          <Repeat className="h-3.5 w-3.5" /> Switch journal file
        </Button>
      </div>
      <KeyValueGrid data={q.data} />
      <Drawer open={editing} onClose={() => setEditing(false)} title="Journal settings" wide>
        {schema && (
          <div className="space-y-4">
            <SchemaForm schema={schema} value={form} onChange={setForm} />
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await axios.put('/v2/journal/settings', form);
                  toast('ok', 'Journal settings saved');
                  setEditing(false);
                  qc.invalidateQueries();
                } catch (e) {
                  toast('err', errText(e));
                }
              }}
            >
              Save
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function JournalFiles() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [recordsOf, setRecordsOf] = useState<string | null>(null);
  const q = useGetJournalFiles();
  const rows = resultOf<Row[]>(q.data) ?? [];

  return (
    <>
      <DataTable
        columns={[
          { key: 'Name', header: 'File', className: 'font-mono text-xs' },
          { key: 'Size', header: 'Size', render: (r) => fmtBytes(Number(r.Size)), sortValue: (r) => Number(r.Size ?? 0) },
          { key: 'DataSize', header: 'Data', render: (r) => fmtBytes(Number(r.DataSize)) },
          { key: 'CreationTime', header: 'Created', render: (r) => fmtDate(String(r.CreationTime)) },
          { key: 'Reason', header: 'Reason', render: (r) => <Badge tone="neutral">{String(r.Reason ?? '—')}</Badge> },
        ]}
        rows={rows}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => qc.invalidateQueries()}
        rowKey={(r) => String(r.Name)}
        dense
        toolbar={
          <Button size="xs" variant="outline" disabled={!recordsOf} onClick={() => setRecordsOf(null)}>
            close records
          </Button>
        }
        onRowClick={(r) => setRecordsOf(String(r.Name))}
      />
      {recordsOf && <JournalRecords file={recordsOf} onClose={() => setRecordsOf(null)} />}
      <div className="mt-3 flex gap-2">
        <Button
          size="xs"
          variant="outline"
          onClick={async () => {
            try {
              await axios.post('/v2/journal/switch-dir');
              toast('ok', 'Journal directory switched');
            } catch (e) {
              toast('err', errText(e));
            }
          }}
        >
          Switch journal directory
        </Button>
      </div>
    </>
  );
}

function JournalRecords({ file, onClose }: { file: string; onClose: () => void }) {
  const [records, setRecords] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [offset, setOffset] = useState(0);

  const load = async (off: number) => {
    try {
      const { data } = await axios.post('/v2/journal/file/records', {
        file,
        offset: off,
        maxRows: 50,
      });
      setRecords(resultOf<Row[]>(data) ?? []);
      setOffset(off);
      setErr('');
    } catch (e) {
      setErr(errText(e));
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader
        title={<span className="font-mono text-xs">{file}</span>}
        subtitle="Journal records (latest 50)"
        actions={
          <div className="flex gap-2">
            <Button size="xs" variant="outline" onClick={() => load(Math.max(0, offset - 50))}>
              ← prev
            </Button>
            <Button size="xs" variant="outline" onClick={() => load(offset + 50)}>
              next →
            </Button>
            <Button size="xs" variant="ghost" onClick={onClose}>
              close
            </Button>
          </div>
        }
      />
      <div className="p-3">
        {!records && !err && (
          <Button size="sm" variant="outline" onClick={() => load(0)}>
            <BookOpen className="h-3.5 w-3.5" /> Load records
          </Button>
        )}
        {err && <p className="text-xs text-red-400">{err}</p>}
        {records && (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-ink-500">
                  {Object.keys(records[0] ?? {}).slice(0, 7).map((k) => (
                    <th key={k} className="px-2 py-1 font-medium">{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((r, i) => (
                  <tr key={i} className="border-t border-ink-800">
                    {Object.values(r).slice(0, 7).map((v, j) => (
                      <td key={j} className="px-2 py-1 font-mono text-ink-300">{String(v ?? '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {records.length === 0 && <p className="py-4 text-center text-ink-500">no records</p>}
          </div>
        )}
      </div>
    </Card>
  );
}

export function JournalPage() {
  return (
    <div>
      <PageHeader
        title="Journal"
        description="Journal files, settings, and records"
        actions={<FileCheck className="h-4 w-4 text-ink-500" />}
      />
      <Tabs
        tabs={[
          { id: 'files', label: 'Files', content: <JournalFiles /> },
          { id: 'settings', label: 'Settings', content: <JournalSettings /> },
        ]}
      />
    </div>
  );
}
