import { ResourcePage } from '../ResourcePage';
import { Badge } from '../../components/ui';
import { useGetSecurityPrivilegedRoutines } from '../../api/generated/security/security';
import { useGetDocDbs } from '../../api/generated/doc-db/doc-db';
import { useGetFsAccessPurposes } from '../../api/generated/fs-access-purpose/fs-access-purpose';

type Row = Record<string, unknown>;

export function PrivilegedRoutinesPage() {
  return (
    <ResourcePage<Row>
      title="Privileged Routines"
      description="Routines that escalate privileges when run"
      listHook={useGetSecurityPrivilegedRoutines as never}
      singlePath="/v2/security/privileged-routine"
      nameKey="Name"
      ops={{
        get: 'getSecurityPrivilegedRoutine',
        update: 'putSecurityPrivilegedRoutine',
        delete: 'deleteSecurityPrivilegedRoutine',
        create: 'putSecurityPrivilegedRoutine',
      }}
      createMethod="put"
      createLabel="New privileged routine"
      columns={[
        { key: 'Name', header: 'Routine', className: 'font-mono text-xs' },
        { key: 'Namespace', header: 'Namespace', render: (r) => String(r.Namespace ?? '—') },
        { key: 'Roles', header: 'Roles granted', render: (r) => (Array.isArray(r.Roles) ? r.Roles.join(', ') : String(r.Roles ?? '—')) },
      ]}
    />
  );
}

export function DocDbsPage() {
  return (
    <ResourcePage<Row>
      title="Document Databases"
      description="DocDB databases per namespace"
      listHook={useGetDocDbs as never}
      singlePath="/v2/doc-db"
      nameKey="Name"
      rowParams={(r) => ({ name: String(r.Name), namespace: String(r.Namespace ?? 'USER') })}
      createParam="name"
      createParams={(n) => ({ name: n, namespace: 'USER' })}
      createMethod="put"
      createLabel="New DocDB"
      ops={{ get: 'getDocDb', update: 'putDocDb', delete: 'deleteDocDb', create: 'putDocDb' }}
      columns={[
        { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
        { key: 'Namespace', header: 'Namespace' },
        { key: 'Enabled', header: 'Enabled', render: (r) => <Badge tone={r.Enabled ? 'green' : 'neutral'}>{r.Enabled ? 'Enabled' : 'Disabled'}</Badge> },
        { key: 'Resource', header: 'Resource', render: (r) => String(r.Resource || '—') },
        { key: 'Description', header: 'Description', render: (r) => String(r.Description || '—') },
      ]}
    />
  );
}

export function FsAccessPage() {
  return (
    <ResourcePage<Row>
      title="File System Access"
      description="Path-based filesystem access purposes (%Admin secure)"
      listHook={useGetFsAccessPurposes as never}
      singlePath="/v2/fs-access-purpose"
      nameKey="Purpose"
      rowParams={(r) => ({ purpose: String(r.Purpose ?? r.Name) })}
      createParam="purpose"
      ops={{
        get: 'getFsAccessPurpose',
        update: 'putFsAccessPurpose',
        delete: 'deleteFsAccessPurpose',
        create: 'putFsAccessPurpose',
      }}
      createMethod="put"
      createLabel="New purpose"
      columns={[
        { key: 'Purpose', header: 'Purpose', className: 'font-mono text-xs', render: (r) => String(r.Purpose ?? r.Name ?? '—') },
        { key: 'Description', header: 'Description', render: (r) => String(r.Description ?? '—') },
        { key: 'Enabled', header: 'Enabled', render: (r) => <Badge tone={r.Enabled ? 'green' : 'neutral'}>{String(r.Enabled ?? '—')}</Badge> },
      ]}
    />
  );
}
