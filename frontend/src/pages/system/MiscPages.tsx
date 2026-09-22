import { useQueryClient } from '@tanstack/react-query';
import { Play, Square } from 'lucide-react';
import { axios } from '../../api/axios-instance';
import { Badge, Button } from '../../components/ui';
import { useToast, errText } from '../../components/toast';
import { ResourcePage } from '../ResourcePage';
import { useGetEcpDataServers, useGetEcpApplicationServers } from '../../api/generated/ecp/ecp';
import { useGetExtLangServers } from '../../api/generated/ext-lang-server/ext-lang-server';
import { useGetWqmCategories } from '../../api/generated/wqm-category/wqm-category';
import { DataTable } from '../../components/DataTable';
import { resultOf } from '../../api/helpers';
import { Tabs } from '../../components/Tabs';
import { PageHeader } from '../../components/PageHeader';

type Row = Record<string, unknown>;

export function EcpPage() {
  return (
    <div>
      <PageHeader title="ECP" description="Enterprise Cache Protocol data & application servers" />
      <Tabs
        tabs={[
          {
            id: 'data',
            label: 'Data Servers',
            content: (
              <ResourcePage<Row>
                title=""
                listHook={useGetEcpDataServers as never}
                singlePath="/v2/ecp/data-server"
                nameKey="Name"
                ops={{ get: 'getEcpDataServer', update: 'putEcpDataServer', delete: 'deleteEcpDataServer', create: 'putEcpDataServer' }}
                createMethod="put"
                createLabel="New data server"
                columns={[
                  { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
                  { key: 'Address', header: 'Address', render: (r) => String(r.Address ?? r.Host ?? '—') },
                  { key: 'Port', header: 'Port' },
                  { key: 'State', header: 'State', render: (r) => <Badge tone="neutral">{String(r.State ?? r.Status ?? '—')}</Badge> },
                ]}
              />
            ),
          },
          {
            id: 'app',
            label: 'Application Servers',
            content: <EcpAppServers />,
          },
        ]}
      />
    </div>
  );
}

function EcpAppServers() {
  const q = useGetEcpApplicationServers();
  const rows = resultOf<Row[]>(q.data) ?? [];
  return (
    <DataTable
      columns={[
        { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
        { key: 'Address', header: 'Address', render: (r) => String(r.Address ?? r.Host ?? '—') },
        { key: 'Port', header: 'Port' },
        { key: 'State', header: 'State', render: (r) => <Badge tone="neutral">{String(r.State ?? r.Status ?? '—')}</Badge> },
      ]}
      rows={rows}
      loading={q.isLoading}
      error={q.error}
      rowKey={(r, i) => String(r.Name ?? i)}
      dense
    />
  );
}

export function ExtLangPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const refresh = () => qc.invalidateQueries();
  const act = async (action: 'start' | 'stop', name: string) => {
    try {
      await axios.post(`/v2/ext-lang-server/${action}`, null, { params: { name } });
      toast('ok', `${action} → ${name}`);
      refresh();
    } catch (e) {
      toast('err', errText(e));
    }
  };
  return (
    <ResourcePage<Row>
      title="External Language Servers"
      description="Java / .NET / Python / Node.js language servers"
      listHook={useGetExtLangServers as never}
      singlePath="/v2/ext-lang-server"
      nameKey="Name"
      ops={{ get: 'getExtLangServer', update: 'putExtLangServer', delete: 'deleteExtLangServer', create: 'putExtLangServer' }}
      createMethod="put"
      createLabel="New language server"
      columns={[
        { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
        { key: 'Type', header: 'Type' },
        { key: 'Port', header: 'Port' },
        { key: 'Running', header: 'Running', render: (r) => <Badge tone={r.Running ? 'green' : 'neutral'}>{String(r.Running ?? '—')}</Badge> },
      ]}
      rowActions={(r) => (
        <span className="inline-flex gap-1">
          <Button size="xs" variant="ghost" title="Start" onClick={() => act('start', String(r.Name))}>
            <Play className="h-3 w-3" />
          </Button>
          <Button size="xs" variant="ghost" title="Stop" onClick={() => act('stop', String(r.Name))}>
            <Square className="h-3 w-3" />
          </Button>
        </span>
      )}
    />
  );
}

export function WqmPage() {
  return (
    <ResourcePage<Row>
      title="Work Queue Manager"
      description="Worker queue categories"
      listHook={useGetWqmCategories as never}
      singlePath="/v2/wqm-category"
      nameKey="Name"
      ops={{ get: 'getWqmCategory', update: 'putWqmCategory', delete: 'deleteWqmCategory', create: 'putWqmCategory' }}
      createMethod="put"
      createLabel="New category"
      columns={[
        { key: 'Name', header: 'Category', className: 'font-mono text-xs' },
        { key: 'MaxActiveWorkers', header: 'Max active' },
        { key: 'DefaultWorkers', header: 'Default' },
        { key: 'MaxWorkers', header: 'Max' },
        { key: 'MaxTotalWorkers', header: 'Max total' },
        { key: 'AlwaysQueue', header: 'Always queue', render: (r) => <Badge tone={r.AlwaysQueue ? 'amber' : 'neutral'}>{String(r.AlwaysQueue ?? '—')}</Badge> },
      ]}
    />
  );
}
