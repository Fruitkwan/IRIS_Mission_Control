import { useQueryClient } from '@tanstack/react-query';
import { Globe } from 'lucide-react';
import { Badge, Button } from '../components/ui';
import { useToast } from '../components/toast-context';
import { errText } from '../lib/errors';
import { axios } from '../api/axios-instance';
import { ResourcePage } from './ResourcePage';
import { useGetWebApps } from '../api/generated/web-app/web-app';

type Row = Record<string, unknown>;

export function WebAppsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return (
    <ResourcePage<Row>
      title="Web Applications"
      description="CSP/REST web applications — paths, namespaces, auth, dispatch classes"
      listHook={useGetWebApps as never}
      singlePath="/v2/web-app"
      nameKey="Name"
      ops={{
        get: 'getWebApp',
        update: 'putWebApp',
        delete: 'deleteWebApp',
        create: 'putWebApp',
      }}
      createMethod="put"
      createLabel="New web app"
      columns={[
        {
          key: 'Name',
          header: 'Path',
          render: (r) => (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-accent-300">
              <Globe className="h-3 w-3" />
              {String(r.Name)}
            </span>
          ),
        },
        { key: 'Namespace', header: 'Namespace' },
        { key: 'Type', header: 'Type', render: (r) => <Badge tone={r.Type === 'REST' ? 'blue' : 'neutral'}>{String(r.Type ?? '—')}</Badge> },
        { key: 'Enabled', header: 'Enabled', render: (r) => <Badge tone={r.Enabled ? 'green' : 'red'}>{r.Enabled ? 'yes' : 'no'}</Badge> },
        { key: 'DispatchClass', header: 'Dispatch', className: 'font-mono text-xs', render: (r) => String(r.DispatchClass ?? '—') },
        { key: 'Resource', header: 'Resource', render: (r) => String(r.Resource ?? '—') },
        { key: 'IsSystemApp', header: 'System', render: (r) => (r.IsSystemApp ? <Badge tone="purple">sys</Badge> : '—') },
      ]}
      rowActions={(r) => (
        <Button
          size="xs"
          variant="ghost"
          title={r.Enabled ? 'Disable' : 'Enable'}
          onClick={async () => {
            try {
              await axios.put('/v2/web-app', { Enabled: !r.Enabled }, { params: { name: r.Name } });
              toast('ok', `${r.Name} ${r.Enabled ? 'disabled' : 'enabled'}`);
              qc.invalidateQueries();
            } catch (e) {
              toast('err', errText(e));
            }
          }}
        >
          {r.Enabled ? 'disable' : 'enable'}
        </Button>
      )}
    />
  );
}
