import { useQuery } from '@tanstack/react-query';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { DataTable } from '../../components/DataTable';
import { KeyValueGrid } from '../../components/DetailDrawer';
import { PageHeader } from '../../components/PageHeader';
import { Tabs } from '../../components/Tabs';
import { Card, ErrorState, PageLoader } from '../../components/ui';
import { useGetLicenseServers } from '../../api/generated/license/license';
import { ResourcePage } from '../ResourcePage';
import { fmtNum } from '../../lib/utils';

type Row = Record<string, unknown>;

function LicenseKey() {
  const q = useQuery({
    queryKey: ['license-key'],
    queryFn: () => axios.get('/v2/license/key').then((r) => resultOf<Row>(r.data)),
  });
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return <KeyValueGrid data={q.data} />;
}

function LicenseUsage() {
  const q = useQuery({
    queryKey: ['license-usage'],
    queryFn: () => axios.get('/v2/monitor/license-usage').then((r) => resultOf<Row>(r.data)),
    refetchInterval: 5000,
  });
  const usage = (q.data?.UsageByProcess as Row[] | undefined) ?? [];
  const summary = Object.fromEntries(
    Object.entries(q.data ?? {}).filter(([k]) => k !== 'UsageByProcess'),
  );
  return (
    <div className="space-y-4">
      {Object.keys(summary).length > 0 && <KeyValueGrid data={summary} />}
      <DataTable
        columns={[
          { key: 'PID', header: 'PID', className: 'font-mono text-xs' },
          { key: 'Process', header: 'Process' },
          { key: 'LID', header: 'License ID' },
          { key: 'Type', header: 'Type' },
          { key: 'LU', header: 'Units', sortValue: (r) => Number(r.LU ?? 0), className: 'text-right font-mono' },
          { key: 'Con', header: 'Conn', sortValue: (r) => Number(r.Con ?? 0), className: 'text-right' },
          { key: 'Active', header: 'Active' },
        ]}
        rows={usage.filter((u) => u.LU || u.Con || u.Type)}
        loading={q.isLoading}
        error={q.error}
        rowKey={(r, i) => String(r.PID ?? i)}
        dense
      />
      <p className="text-xs text-ink-500">
        {fmtNum(usage.length)} processes tracked · refreshes every 5s
      </p>
    </div>
  );
}

export function LicensePage() {
  return (
    <div>
      <PageHeader title="License" description="License key, servers, and live usage" />
      <Tabs
        tabs={[
          {
            id: 'key',
            label: 'License Key',
            content: (
              <Card className="p-4">
                <LicenseKey />
              </Card>
            ),
          },
          {
            id: 'servers',
            label: 'License Servers',
            content: (
              <ResourcePage<Row>
                title=""
                listHook={useGetLicenseServers as never}
                singlePath="/v2/license/server"
                nameKey="Name"
                ops={{ get: 'getLicenseServer', update: 'putLicenseServer', delete: 'deleteLicenseServer', create: 'putLicenseServer' }}
                createMethod="put"
                createLabel="New license server"
                columns={[
                  { key: 'Name', header: 'Name' },
                  { key: 'Address', header: 'Address', className: 'font-mono text-xs' },
                  { key: 'Port', header: 'Port' },
                  { key: 'KeyDirectory', header: 'Key dir', className: 'font-mono text-xs' },
                ]}
              />
            ),
          },
          { id: 'usage', label: 'Usage', content: <LicenseUsage /> },
        ]}
      />
    </div>
  );
}
