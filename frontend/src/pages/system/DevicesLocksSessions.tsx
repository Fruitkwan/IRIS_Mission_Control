import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { Badge, Button } from '../../components/ui';
import { useToast, errText } from '../../components/toast';
import { ResourcePage } from '../ResourcePage';
import { useGetDevices } from '../../api/generated/device/device';
import { useGetLocks } from '../../api/generated/lock/lock';
import { useGetWebSessions } from '../../api/generated/web-session/web-session';

type Row = Record<string, unknown>;

export function DevicesPage() {
  return (
    <ResourcePage<Row>
      title="Devices"
      description="I/O devices known to the instance"
      listHook={useGetDevices as never}
      singlePath="/v2/device"
      nameKey="Name"
      ops={{ get: 'getDevice', update: 'putDevice', delete: 'deleteDevice', create: 'putDevice' }}
      createMethod="put"
      createLabel="New device"
      columns={[
        { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
        { key: 'PhysicalDevice', header: 'Physical' },
        { key: 'Type', header: 'Type' },
        { key: 'SubType', header: 'Subtype' },
        { key: 'Alias', header: 'Alias', render: (r) => String(r.Alias ?? '—') },
        { key: 'Description', header: 'Description', render: (r) => String(r.Description ?? '—') },
      ]}
    />
  );
}

export function LocksPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const refresh = () => qc.invalidateQueries();
  return (
    <ResourcePage<Row>
      title="Locks"
      description="Active lock table entries"
      listHook={useGetLocks as never}
      nameKey={(r) => String(r.Reference ?? r.DeleteID ?? '')}
      hideEdit
      columns={[
        { key: 'Pid', header: 'PID', className: 'font-mono text-xs' },
        { key: 'Reference', header: 'Lock reference', className: 'font-mono text-xs' },
        { key: 'ModeCount', header: 'Mode/Count' },
        { key: 'Directory', header: 'Directory' },
        { key: 'System', header: 'System', render: (r) => String(r.System ?? '—') },
        { key: 'RoutineInfo', header: 'Routine', render: (r) => String(r.RoutineInfo ?? '—') },
      ]}
      rowActions={(r) =>
        r.DeleteID ? (
          <Button
            size="xs"
            variant="ghost"
            className="text-red-400"
            title="Delete lock"
            onClick={async () => {
              try {
                await axios.delete('/v2/lock', { params: { id: r.DeleteID } });
                toast('ok', 'Lock removed');
                refresh();
              } catch (e) {
                toast('err', errText(e));
              }
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        ) : null
      }
    />
  );
}

export function SessionsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const refresh = () => qc.invalidateQueries();
  return (
    <ResourcePage<Row>
      title="Web Sessions"
      description="Active CSP/web sessions"
      listHook={useGetWebSessions as never}
      nameKey={(r) => String(r.ID ?? '')}
      hideEdit
      columns={[
        { key: 'ID', header: 'Session ID', className: 'font-mono text-xs' },
        { key: 'Username', header: 'User' },
        { key: 'Application', header: 'Application', render: (r) => String(r.Application ?? '—') },
        { key: 'Timeout', header: 'Timeout' },
        { key: 'Preserve', header: 'Preserve', render: (r) => <Badge tone={r.Preserve ? 'amber' : 'neutral'}>{String(r.Preserve ?? '—')}</Badge> },
        { key: 'SesProcessId', header: 'PID', className: 'font-mono text-xs' },
      ]}
      rowActions={(r) =>
        r.AllowEndSession ? (
          <Button
            size="xs"
            variant="ghost"
            className="text-red-400"
            title="End session"
            onClick={async () => {
              try {
                await axios.delete('/v2/web-session', { params: { id: r.ID } });
                toast('ok', 'Session ended');
                refresh();
              } catch (e) {
                toast('err', errText(e));
              }
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        ) : null
      }
    />
  );
}

export { resultOf };
