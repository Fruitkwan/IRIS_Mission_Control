import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { DataTable } from '../../components/DataTable';
import { PageHeader } from '../../components/PageHeader';
import { Tabs } from '../../components/Tabs';
import { Badge, Button, Card, Input, Select } from '../../components/ui';
import { useToast, errText } from '../../components/toast';
import { useGetSecurityUsers, useGetSecurityRoles } from '../../api/generated/security/security';
import { useGetNamespaces } from '../../api/generated/namespace/namespace';

type Row = Record<string, unknown>;

function useGranteePrivs(kind: 'privileges' | 'admin-privileges' | 'column-privileges', grantee: string, namespace: string) {
  return useQuery({
    queryKey: ['sql', kind, grantee, namespace],
    enabled: !!grantee,
    queryFn: () =>
      axios
        .get(`/v2/security/sql-${kind}`, { params: { grantee, namespace } })
        .then((r) => resultOf<Row[]>(r.data) ?? []),
  });
}

function GrantForm({
  kind,
  grantee,
  namespace,
  onDone,
}: {
  kind: string;
  grantee: string;
  namespace: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [f, setF] = useState<Record<string, string>>({ action: 'GRANT' });
  const fields =
    kind === 'privileges'
      ? ['type', 'object', 'action']
      : kind === 'admin-privileges'
        ? ['privilege']
        : ['type', 'object', 'column', 'action'];
  const submit = async (verb: 'grant' | 'revoke') => {
    try {
      await axios.post(`/v2/security/sql-${kind}/${verb}`, null, {
        params: { grantee, namespace, ...f },
      });
      toast('ok', `${verb} applied`);
      onDone();
    } catch (e) {
      toast('err', errText(e));
    }
  };
  return (
    <Card className="flex flex-wrap items-end gap-2 p-3">
      {fields.map((fld) => (
        <div key={fld} className="w-40">
          <label className="mb-1 block text-[11px] text-ink-400">{fld}</label>
          <Input
            className="h-8 text-xs"
            value={f[fld] ?? ''}
            onChange={(e) => setF((s) => ({ ...s, [fld]: e.target.value }))}
          />
        </div>
      ))}
      <Button size="sm" variant="success" onClick={() => submit('grant')}>
        Grant
      </Button>
      <Button size="sm" variant="danger" onClick={() => submit('revoke')}>
        Revoke
      </Button>
    </Card>
  );
}

function PrivTab({ kind, grantee, namespace }: { kind: 'privileges' | 'admin-privileges' | 'column-privileges'; grantee: string; namespace: string }) {
  const q = useGranteePrivs(kind, grantee, namespace);
  const qc = useQueryClient();
  const rows = q.data ?? [];
  const cols = rows.length
    ? Object.keys(rows[0]).slice(0, 7).map((k) => ({
        key: k,
        header: k,
        render: (r: Row) => (
          <span className="font-mono text-xs">
            {typeof r[k] === 'object' ? JSON.stringify(r[k]) : String(r[k] ?? '—')}
          </span>
        ),
      }))
    : [{ key: 'x', header: 'Privilege' }];
  return (
    <div className="space-y-3">
      {grantee && (
        <GrantForm kind={kind} grantee={grantee} namespace={namespace} onDone={() => qc.invalidateQueries({ queryKey: ['sql'] })} />
      )}
      {!grantee && <p className="text-xs text-ink-500">Pick a grantee above to view and edit privileges.</p>}
      {grantee && (
        <DataTable columns={cols} rows={rows} loading={q.isLoading} error={q.error} rowKey={(_, i) => String(i)} dense />
      )}
    </div>
  );
}

export function SqlPrivilegesPage() {
  const users = useGetSecurityUsers();
  const roles = useGetSecurityRoles();
  const namespaces = useGetNamespaces();
  const [grantee, setGrantee] = useState('');
  const [namespace, setNamespace] = useState('%SYS');

  const grantees = [
    ...(resultOf<Row[]>(users.data) ?? []).map((u) => `user:${u.Name}`),
    ...(resultOf<Row[]>(roles.data) ?? []).map((r) => `role:${r.Name}`),
  ];
  const nsList = (resultOf<Row[]>(namespaces.data) ?? []).map((n) => String(n.Name));

  return (
    <div className="space-y-4">
      <PageHeader
        title="SQL Privileges"
        description="Grant / revoke SQL object, admin, and column privileges per user or role"
      />
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-[11px] text-ink-400">Grantee</label>
          <Select value={grantee} onChange={(e) => setGrantee(e.target.value)} className="w-64">
            <option value="">— choose user or role —</option>
            {grantees.map((g) => (
              <option key={g} value={g.split(':')[1]}>
                {g}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-ink-400">Namespace</label>
          <Select value={namespace} onChange={(e) => setNamespace(e.target.value)} className="w-40">
            {nsList.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </div>
        {grantee && <Badge tone="teal">{grantee}</Badge>}
      </Card>
      <Tabs
        tabs={[
          { id: 'obj', label: 'Object privileges', content: <PrivTab kind="privileges" grantee={grantee} namespace={namespace} /> },
          { id: 'admin', label: 'Admin privileges', content: <PrivTab kind="admin-privileges" grantee={grantee} namespace={namespace} /> },
          { id: 'col', label: 'Column privileges', content: <PrivTab kind="column-privileges" grantee={grantee} namespace={namespace} /> },
        ]}
      />
    </div>
  );
}
