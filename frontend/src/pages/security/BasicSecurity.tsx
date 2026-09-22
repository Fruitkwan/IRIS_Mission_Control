import { Badge } from '../../components/ui';
import { ResourcePage } from '../ResourcePage';
import {
  useGetSecurityUsers,
  useGetSecurityRoles,
  useGetSecurityResources,
  useGetSecurityServices,
} from '../../api/generated/security/security';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null || v === '' ? '—' : String(v));
const bool = (v: unknown) => (
  <Badge tone={v ? 'green' : 'neutral'}>{v ? 'yes' : 'no'}</Badge>
);

export function UsersPage() {
  return (
    <ResourcePage<Row>
      title="Users"
      description="IRIS user accounts"
      listHook={useGetSecurityUsers as never}
      singlePath="/v2/security/user"
      nameKey="Name"
      ops={{
        get: 'getSecurityUser',
        create: 'postSecurityUser',
        update: 'putSecurityUser',
        delete: 'deleteSecurityUser',
      }}
      createLabel="New user"
      columns={[
        { key: 'Name', header: 'Name' },
        { key: 'FullName', header: 'Full name' },
        { key: 'Namespace', header: 'Namespace' },
        { key: 'Routine', header: 'Routine' },
        { key: 'Type', header: 'Type' },
        { key: 'Enabled', header: 'Enabled', render: (r) => bool(r.Enabled) },
      ]}
    />
  );
}

export function RolesPage() {
  return (
    <ResourcePage<Row>
      title="Roles"
      description="Security roles — created via PUT"
      listHook={useGetSecurityRoles as never}
      singlePath="/v2/security/role"
      nameKey="Name"
      ops={{
        get: 'getSecurityRole',
        create: 'putSecurityRole',
        update: 'putSecurityRole',
        delete: 'deleteSecurityRole',
      }}
      createMethod="put"
      createLabel="New role"
      columns={[
        { key: 'Name', header: 'Name' },
        { key: 'Description', header: 'Description' },
        { key: 'CreatedBy', header: 'Created by', render: (r) => s(r.CreatedBy) },
        { key: 'EscalationOnly', header: 'Escalation only', render: (r) => bool(r.EscalationOnly) },
      ]}
    />
  );
}

export function ResourcesPage() {
  return (
    <ResourcePage<Row>
      title="Resources"
      description="Protectable assets and their public permissions"
      listHook={useGetSecurityResources as never}
      singlePath="/v2/security/resource"
      nameKey="Name"
      ops={{
        get: 'getSecurityResource',
        create: 'putSecurityResource',
        update: 'putSecurityResource',
        delete: 'deleteSecurityResource',
      }}
      createMethod="put"
      createLabel="New resource"
      columns={[
        { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
        { key: 'Description', header: 'Description', render: (r) => s(r.Description) },
        { key: 'ResourceType', header: 'Type' },
        { key: 'PublicPermission', header: 'Public perm', render: (r) => s(r.PublicPermission) },
        { key: 'AllowDelete', header: 'Deletable', render: (r) => bool(r.AllowDelete) },
      ]}
    />
  );
}

export function ServicesPage() {
  return (
    <ResourcePage<Row>
      title="Services"
      description="IRIS services and their authentication methods"
      listHook={useGetSecurityServices as never}
      singlePath="/v2/security/service"
      nameKey="Name"
      ops={{ get: 'getSecurityService', update: 'putSecurityService' }}
      columns={[
        { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
        { key: 'Enabled', header: 'Enabled', render: (r) => bool(r.Enabled) },
        { key: 'Public', header: 'Public', render: (r) => bool(r.Public) },
        {
          key: 'AuthenticationMethods',
          header: 'Auth methods',
          render: (r) => s(Array.isArray(r.AuthenticationMethods) ? r.AuthenticationMethods.join(', ') : r.AuthenticationMethods),
        },
        { key: 'Description', header: 'Description', render: (r) => s(r.Description) },
      ]}
    />
  );
}
