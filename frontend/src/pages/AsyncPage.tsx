import { useQueryClient } from '@tanstack/react-query';
import { Pause, Play, XCircle } from 'lucide-react';
import { axios } from '../api/axios-instance';
import { resultOf } from '../api/helpers';
import { DataTable } from '../components/DataTable';
import { Drawer, KeyValueGrid } from '../components/DetailDrawer';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, Card } from '../components/ui';
import { useToast, errText } from '../components/toast';
import { useGetAsyncResults } from '../api/generated/async-result/async-result';
import { useState } from 'react';

type Row = Record<string, unknown>;

export function AsyncPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useGetAsyncResults();
  const rows = resultOf<Row[]>(q.data) ?? [];
  const [detail, setDetail] = useState<Row | null>(null);
  const refresh = () => qc.invalidateQueries();

  const act = async (a: 'pause' | 'resume' | 'cancel', id: unknown) => {
    try {
      await axios.post(`/v2/async-result/${a}`, null, { params: { id } });
      toast('ok', `${a} → ${id}`);
      refresh();
    } catch (e) {
      toast('err', errText(e));
    }
  };

  return (
    <div>
      <PageHeader
        title="Async Operations"
        description="Long-running server-side jobs (integrity checks, defrags, imports)"
      />
      <Card className="p-4">
        <DataTable
          rows={rows}
          loading={q.isLoading}
          error={q.error}
          onRetry={refresh}
          rowKey={(r, i) => String(r.GUID ?? r.Id ?? i)}
          dense
          onRowClick={async (r) => {
            try {
              const { data } = await axios.get('/v2/async-result', { params: { id: r.GUID ?? r.Id } });
              setDetail(resultOf<Row>(data) ?? (data as Row));
            } catch {
              setDetail(r);
            }
          }}
          columns={[...[
            { key: 'GUID', header: 'ID', className: 'font-mono text-xs', render: (r: Row) => String(r.GUID ?? r.Id ?? '—') },
            { key: 'Status', header: 'Status', render: (r: Row) => <Badge tone={r.Status === 'Completed' ? 'green' : r.Status === 'Running' ? 'blue' : 'neutral'}>{String(r.Status ?? '—')}</Badge> },
            { key: 'Result', header: 'Result', render: (r: Row) => <span className="font-mono text-xs">{String(r.Result ?? '—')}</span> },
          ], {
            key: '__act',
            header: '',
            searchable: false,
            className: 'w-px whitespace-nowrap text-right',
            render: (r: Row) => {
              const id = r.GUID ?? r.Id;
              return (
                <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button size="xs" variant="ghost" title="Pause" onClick={() => act('pause', id)}><Pause className="h-3 w-3" /></Button>
                  <Button size="xs" variant="ghost" title="Resume" onClick={() => act('resume', id)}><Play className="h-3 w-3" /></Button>
                  <Button size="xs" variant="ghost" title="Cancel" className="text-red-400" onClick={() => act('cancel', id)}><XCircle className="h-3 w-3" /></Button>
                </span>
              );
            },
          }]}
        />
      </Card>
      <Drawer open={!!detail} onClose={() => setDetail(null)} title="Async operation">
        {detail && <KeyValueGrid data={detail} />}
      </Drawer>
    </div>
  );
}
