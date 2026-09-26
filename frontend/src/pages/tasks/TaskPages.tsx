import { useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Zap } from 'lucide-react';
import { axios } from '../../api/axios-instance';
import { Badge, Button, Card, CardHeader } from '../../components/ui';
import { useToast } from '../../components/toast-context';
import { errText } from '../../lib/errors';
import { DataTable } from '../../components/DataTable';
import { KeyValueGrid } from '../../components/DetailDrawer';
import { PageHeader } from '../../components/PageHeader';
import { resultOf } from '../../api/helpers';
import { fmtDate, fmtRelative, cn } from '../../lib/utils';
import { ResourcePage } from '../ResourcePage';
import { useGetTasks, useGetTaskUpcoming, useGetTaskHistory, useGetTaskManager } from '../../api/generated/task/task';
import { useQuery } from '@tanstack/react-query';

type Row = Record<string, unknown>;

function TaskManagerBar() {
  const q = useGetTaskManager();
  const qc = useQueryClient();
  const { toast } = useToast();
  const status = (resultOf<Row>(q.data)?.Status as string) ?? 'unknown';
  const act = async (a: 'run' | 'suspend' | 'resume') => {
    try {
      await axios.post(`/v2/task/manager/${a}`);
      toast('ok', `Task manager: ${a}`);
      qc.invalidateQueries();
    } catch (e) {
      toast('err', errText(e));
    }
  };
  return (
    <Card className="mb-4 flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={cn('h-2.5 w-2.5 rounded-full', status === 'Running' ? 'bg-emerald-400' : 'bg-amber-400')} />
        <span className="text-sm">Task Manager: <b>{status}</b></span>
      </div>
      <div className="flex gap-2">
        <Button size="xs" variant="outline" onClick={() => act('run')}>Run now</Button>
        <Button size="xs" variant="outline" onClick={() => act('suspend')}>Suspend</Button>
        <Button size="xs" variant="outline" onClick={() => act('resume')}>Resume</Button>
      </div>
    </Card>
  );
}

export function TasksPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const refresh = () => qc.invalidateQueries();
  const act = async (a: 'run' | 'suspend' | 'resume', id: unknown) => {
    try {
      await axios.post(`/v2/task/${a}`, null, { params: { id } });
      toast('ok', `${a} → task ${id}`);
      refresh();
    } catch (e) {
      toast('err', errText(e));
    }
  };
  return (
    <div>
      <TaskManagerBar />
      <ResourcePage<Row>
        title="Tasks"
        description="Scheduled tasks — run, suspend, resume, edit schedule"
        listHook={useGetTasks as never}
        singlePath="/v2/task"
        nameKey="Name"
        rowParams={(r) => ({ id: String(r.Id) })}
        createParam="id"
        ops={{ get: 'getTask', update: 'putTask', delete: 'deleteTask', create: 'postTask' }}
        createLabel="New task"
        columns={[
          { key: 'Name', header: 'Name' },
          { key: 'Type', header: 'Type', render: (r) => <Badge tone="neutral">{String(r.Type ?? '—')}</Badge> },
          { key: 'Namespace', header: 'NS' },
          { key: 'Suspended', header: 'State', render: (r) => <Badge tone={r.Suspended ? 'amber' : 'green'}>{r.Suspended ? 'suspended' : 'active'}</Badge> },
          { key: 'NextScheduled', header: 'Next run', render: (r) => fmtRelative(r.NextScheduled as string) },
          { key: 'LastFinished', header: 'Last finished', render: (r) => fmtDate(r.LastFinished as string) },
        ]}
        rowActions={(r) => (
          <span className="inline-flex gap-1">
            <Button size="xs" variant="ghost" title="Run now" onClick={() => act('run', r.Id)}><Zap className="h-3 w-3" /></Button>
            {r.Suspended ? (
              <Button size="xs" variant="ghost" title="Resume" onClick={() => act('resume', r.Id)}><Play className="h-3 w-3" /></Button>
            ) : (
              <Button size="xs" variant="ghost" title="Suspend" onClick={() => act('suspend', r.Id)}><Pause className="h-3 w-3" /></Button>
            )}
          </span>
        )}
      />
    </div>
  );
}

export function UpcomingTasksPage() {
  const q = useGetTaskUpcoming();
  const rows = resultOf<Row[]>(q.data) ?? [];
  const qc = useQueryClient();
  return (
    <div>
      <PageHeader title="Upcoming Tasks" description="Next scheduled executions" />
      <Card className="p-4">
        <DataTable
          columns={[
            { key: 'Datetime', header: 'Scheduled', render: (r) => fmtDate(r.Datetime as string), sortValue: (r) => String(r.Datetime ?? '') },
            { key: 'Name', header: 'Task' },
            { key: 'Namespace', header: 'NS' },
            { key: 'Suspended', header: 'State', render: (r) => <Badge tone={r.Suspended ? 'amber' : 'green'}>{r.Suspended ? 'suspended' : 'active'}</Badge> },
          ]}
          rows={rows}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => qc.invalidateQueries()}
          rowKey={(r) => String(r.Id)}
          dense
        />
      </Card>
    </div>
  );
}

export function TaskHistoryPage() {
  const q = useGetTaskHistory();
  const rows = resultOf<Row[]>(q.data) ?? [];
  const qc = useQueryClient();
  const info = useQuery({
    queryKey: ['task-info'],
    queryFn: () => axios.get('/v2/task/info').then((r) => resultOf<Row>(r.data)),
  });
  return (
    <div>
      <PageHeader title="Task History" description="Execution log of scheduled tasks" />
      {info.data && (
        <Card className="mb-4">
          <CardHeader title="Task manager info" />
          <div className="p-3"><KeyValueGrid data={info.data} /></div>
        </Card>
      )}
      <Card className="p-4">
        <DataTable
          columns={[
            { key: 'LogDatetime', header: 'Logged', render: (r) => fmtDate(r.LogDatetime as string) },
            { key: 'Name', header: 'Task' },
            { key: 'Namespace', header: 'NS' },
            { key: 'Status', header: 'Status', render: (r) => <Badge tone={r.Status === '1' ? 'green' : 'red'}>{r.Status === '1' ? 'ok' : String(r.Status ?? '—')}</Badge> },
            { key: 'Result', header: 'Result', render: (r) => <span className="text-xs">{String(r.Result ?? '—')}</span> },
            { key: 'Username', header: 'User' },
            { key: 'ErrNumber', header: 'Err', render: (r) => (Number(r.ErrNumber) ? <span className="text-red-400">{String(r.ErrNumber)}</span> : '—') },
          ]}
          rows={rows}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => qc.invalidateQueries()}
          rowKey={(_, i) => String(i)}
          dense
        />
      </Card>
    </div>
  );
}
