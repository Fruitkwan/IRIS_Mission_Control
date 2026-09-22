import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { Badge, Card, PageLoader } from '../../components/ui';
import { ResourcePage } from '../ResourcePage';
import { useGetNamespaces } from '../../api/generated/namespace/namespace';

type Row = Record<string, unknown>;

function Mappings({ ns }: { ns: string }) {
  const kinds = [
    { label: 'Global mappings', path: '/v2/namespace/global-mappings' },
    { label: 'Routine mappings', path: '/v2/namespace/routine-mappings' },
    { label: 'Package mappings', path: '/v2/namespace/package-mappings' },
  ];
  return (
    <div className="space-y-4">
      {kinds.map((k) => (
        <MappingBlock key={k.label} label={k.label} path={k.path} ns={ns} />
      ))}
    </div>
  );
}

function MappingBlock({ label, path, ns }: { label: string; path: string; ns: string }) {
  const q = useQuery({
    queryKey: [path, ns],
    queryFn: () => axios.get(path, { params: { namespace: ns } }).then((r) => resultOf(r.data)),
    retry: 0,
  });
  const rows = (Array.isArray(q.data) ? q.data : []) as Row[];
  return (
    <Card>
      <div className="border-b border-ink-800 px-3 py-2 text-xs font-semibold text-ink-300">
        {label} <span className="text-ink-500">({rows.length})</span>
      </div>
      {q.isLoading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <p className="px-3 py-3 text-xs text-ink-500">none</p>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-ink-800/50 last:border-0">
                {Object.entries(r).slice(0, 5).map(([k, v]) => (
                  <td key={k} className="px-3 py-1.5">
                    <span className="text-ink-500">{k}=</span>
                    <span className="font-mono">{String(v)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

export function NamespacesPage() {
  const [mappingsNs, setMappingsNs] = useState<string | null>(null);
  return (
    <ResourcePage<Row>
      title="Namespaces"
      description="Namespaces and their global/routine/package mappings"
      listHook={useGetNamespaces as never}
      singlePath="/v2/namespace"
      nameKey="Name"
      ops={{ get: 'getNamespace', update: 'putNamespace', delete: 'deleteNamespace', create: 'putNamespace' }}
      createMethod="put"
      createLabel="New namespace"
      columns={[
        { key: 'Name', header: 'Name', render: (r) => <span className="font-mono text-xs font-semibold text-accent-300">{String(r.Name)}</span> },
        { key: 'Globals', header: 'Globals DB', render: (r) => String(r.Globals ?? '—') },
        { key: 'Routines', header: 'Routines DB', render: (r) => String(r.Routines ?? '—') },
        { key: 'SysGlobals', header: 'Sys globals', render: (r) => String(r.SysGlobals ?? '—') },
        { key: 'Library', header: 'Library', render: (r) => String(r.Library ?? '—') },
        { key: 'TempGlobals', header: 'Temp globals', render: (r) => String(r.TempGlobals ?? '—') },
      ]}
      drawerActions={(r) => (
        <Badge tone="teal" className="cursor-pointer" onClick={() => setMappingsNs(String(r.Name))}>
          view mappings
        </Badge>
      )}
      extraDetail={(r) => (mappingsNs === String(r.Name) ? <Mappings ns={mappingsNs} /> : null)}
    />
  );
}
