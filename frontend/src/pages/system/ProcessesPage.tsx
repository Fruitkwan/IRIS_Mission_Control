import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Pause, Play, RefreshCw, Skull } from 'lucide-react';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { DataTable, type Column } from '../../components/DataTable';
import { Drawer, KeyValueGrid } from '../../components/DetailDrawer';
import { PageHeader } from '../../components/PageHeader';
import { Badge, Button, Card, Input } from '../../components/ui';
import { useToast, errText } from '../../components/toast';
import { cn } from '../../lib/utils';

type Proc = {
  Job?: number;
  Pid?: number;
  Username?: string;
  Device?: string;
  Nspace?: string;
  Routine?: string;
  Commands?: number;
  Globals?: number;
  State?: string;
  ClientName?: string;
  EXEname?: string;
  IPAddress?: string;
  CPUTime?: number;
  ElapsedTime?: string;
  OSUserName?: string;
  CanBeSuspended?: boolean;
  CanBeTerminated?: boolean;
  CanReceiveBroadcast?: boolean;
};

export function ProcessesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selected, setSelected] = useState<Proc | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [broadcast, setBroadcast] = useState<{ open: boolean; msg: string; pid?: number }>({
    open: false,
    msg: '',
  });
  const [confirmKill, setConfirmKill] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ['processes'],
    queryFn: () => axios.get('/v2/processes').then((r) => resultOf<Proc[]>(r.data) ?? []),
    refetchInterval: autoRefresh ? 2500 : false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['processes'] });

  const act = async (action: 'suspend' | 'resume' | 'terminate', p: Proc) => {
    try {
      await axios.post(`/v2/process/${action}`, null, { params: { id: p.Pid } });
      toast('ok', `${action} → pid ${p.Pid}`);
      refresh();
    } catch (e) {
      toast('err', errText(e));
    }
  };

  const sendBroadcast = async () => {
    try {
      await axios.post('/v2/process/broadcast', { Message: broadcast.msg, Pid: broadcast.pid });
      toast('ok', 'Broadcast sent');
      setBroadcast({ open: false, msg: '' });
    } catch (e) {
      // try alternate shape
      try {
        await axios.post('/v2/process/broadcast', { message: broadcast.msg, pid: broadcast.pid });
        toast('ok', 'Broadcast sent');
        setBroadcast({ open: false, msg: '' });
      } catch (e2) {
        toast('err', errText(e2));
      }
    }
  };

  const openDetail = async (p: Proc) => {
    setSelected(p);
    try {
      const { data } = await axios.get('/v2/process', { params: { id: p.Pid } });
      setDetail(resultOf<Record<string, unknown>>(data) ?? (data as Record<string, unknown>));
    } catch {
      setDetail(p as Record<string, unknown>);
    }
  };

  const columns: Column<Proc>[] = [
    { key: 'Pid', header: 'PID', sortValue: (r) => r.Pid ?? 0, className: 'font-mono text-xs' },
    {
      key: 'State',
      header: 'State',
      render: (r) => (
        <Badge tone={r.State === 'RUN' ? 'green' : r.State?.includes('SUSP') ? 'amber' : 'neutral'}>
          {r.State ?? '—'}
        </Badge>
      ),
    },
    { key: 'Username', header: 'User' },
    { key: 'Nspace', header: 'Namespace' },
    { key: 'Routine', header: 'Routine', className: 'font-mono text-xs' },
    { key: 'ClientName', header: 'Client' },
    { key: 'Commands', header: 'Commands', sortValue: (r) => r.Commands ?? 0, className: 'text-right font-mono text-xs' },
    { key: 'Globals', header: 'Globals', sortValue: (r) => r.Globals ?? 0, className: 'text-right font-mono text-xs' },
    { key: 'CPUTime', header: 'CPU ms', sortValue: (r) => r.CPUTime ?? 0, className: 'text-right font-mono text-xs' },
    { key: 'ElapsedTime', header: 'Elapsed', className: 'font-mono text-xs' },
    {
      key: '__act',
      header: '',
      searchable: false,
      className: 'w-px whitespace-nowrap text-right',
      render: (r) => (
        <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
          {r.CanBeSuspended && (
            <Button size="xs" variant="ghost" title="Suspend" onClick={() => act('suspend', r)}>
              <Pause className="h-3 w-3" />
            </Button>
          )}
          {r.State?.includes('SUSP') && (
            <Button size="xs" variant="ghost" title="Resume" onClick={() => act('resume', r)}>
              <Play className="h-3 w-3" />
            </Button>
          )}
          {r.CanReceiveBroadcast && (
            <Button
              size="xs"
              variant="ghost"
              title="Broadcast"
              onClick={() => setBroadcast({ open: true, msg: '', pid: r.Pid })}
            >
              <Megaphone className="h-3 w-3" />
            </Button>
          )}
          {r.CanBeTerminated &&
            (confirmKill === r.Pid ? (
              <Button size="xs" variant="danger" onClick={() => act('terminate', r)}>
                kill?
              </Button>
            ) : (
              <Button size="xs" variant="ghost" title="Terminate" className="text-red-400" onClick={() => setConfirmKill(r.Pid ?? null)}>
                <Skull className="h-3 w-3" />
              </Button>
            ))}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Processes"
        description="Live view of all IRIS jobs"
        actions={
          <>
            <label className="flex items-center gap-2 text-xs text-ink-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="accent-teal-500"
              />
              auto-refresh
            </label>
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw className={cn('h-3.5 w-3.5', q.isFetching && 'animate-spin')} />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setBroadcast({ open: true, msg: '' })}>
              <Megaphone className="h-3.5 w-3.5" /> Broadcast all
            </Button>
          </>
        }
      />
      <Card className="p-4">
        <DataTable
          columns={columns}
          rows={q.data}
          loading={q.isLoading}
          error={q.error}
          onRetry={refresh}
          rowKey={(r) => String(r.Pid)}
          onRowClick={openDetail}
          dense
        />
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={`Process ${selected?.Pid ?? ''}`}>
        {detail && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {Boolean(selected?.CanBeSuspended) && (
                <Button size="sm" variant="outline" onClick={() => act('suspend', selected!)}>
                  <Pause className="h-3.5 w-3.5" /> Suspend
                </Button>
              )}
              {Boolean(selected?.CanBeTerminated) && (
                <Button size="sm" variant="danger" onClick={() => act('terminate', selected!)}>
                  <Skull className="h-3.5 w-3.5" /> Terminate
                </Button>
              )}
            </div>
            <KeyValueGrid data={detail} />
          </div>
        )}
      </Drawer>

      <Drawer
        open={broadcast.open}
        onClose={() => setBroadcast({ open: false, msg: '' })}
        title={broadcast.pid ? `Broadcast to PID ${broadcast.pid}` : 'Broadcast to all processes'}
      >
        <div className="space-y-3">
          <label className="block text-xs text-ink-400">Message</label>
          <Input
            value={broadcast.msg}
            onChange={(e) => setBroadcast((b) => ({ ...b, msg: e.target.value }))}
            placeholder="Message text…"
          />
          <Button size="sm" onClick={sendBroadcast} disabled={!broadcast.msg}>
            Send
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
