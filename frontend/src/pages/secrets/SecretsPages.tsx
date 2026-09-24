import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, KeyRound, Plus, Trash2 } from 'lucide-react';
import { axios } from '../../api/axios-instance';
import { DataTable } from '../../components/DataTable';
import { Drawer, KeyValueGrid } from '../../components/DetailDrawer';
import { PageHeader } from '../../components/PageHeader';
import { Tabs } from '../../components/Tabs';
import { Badge, Button, Input, PageLoader } from '../../components/ui';
import { useToast, errText } from '../../components/toast';
import { resultOf } from '../../api/helpers';
import { ResourcePage } from '../ResourcePage';
import {
  useGetSecurityX509Credentials,
  useGetSecurityOauth2ServerClients,
  useGetSecurityOauth2ResourceServers,
  useGetSecurityOauth2ClientServerDefinitions,
  useGetSecurityOauth2ClientClientConfigurations,
} from '../../api/generated/security/security';
import type { OAuth2AuthorizationServerListItem } from '../../api/generated/sysAdminAPIs.schemas';
import { useGetWalletCollections } from '../../api/generated/wallet/wallet';
import { useQuery } from '@tanstack/react-query';

type Row = Record<string, unknown>;

export function WalletPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [collection, setCollection] = useState<string | null>(null);

  const secrets = useQuery({
    queryKey: ['wallet-secrets', collection],
    enabled: !!collection,
    queryFn: () =>
      axios.get('/v2/wallet/secrets', { params: { collection } }).then((r) => resultOf<Row[]>(r.data) ?? []),
  });

  return (
    <div>
      <PageHeader title="Wallet" description="Secret collections (passwords, API keys) stored in IRIS" />
      <Tabs
        tabs={[
          {
            id: 'collections',
            label: 'Collections',
            content: (
              <ResourcePage<Row>
                title=""
                listHook={useGetWalletCollections as never}
                singlePath="/v2/wallet/collection"
                nameKey="Name"
                ops={{
                  get: 'getWalletCollection',
                  update: 'putWalletCollection',
                  delete: 'deleteWalletCollection',
                  create: 'putWalletCollection',
                }}
                createMethod="put"
                createLabel="New collection"
                columns={[
                  { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
                  { key: 'Description', header: 'Description', render: (r) => String(r.Description ?? '—') },
                ]}
                drawerActions={(r) => (
                  <Button size="sm" variant="outline" onClick={() => setCollection(String(r.Name))}>
                    <KeyRound className="h-3.5 w-3.5" /> Secrets
                  </Button>
                )}
              />
            ),
          },
          {
            id: 'all',
            label: 'All Secrets',
            content: <AllSecrets />,
          },
        ]}
      />

      <Drawer open={!!collection} onClose={() => setCollection(null)} title={`Secrets in ${collection}`} wide>
        <SecretsPanel collection={collection!} secrets={secrets} refresh={() => { secrets.refetch(); qc.invalidateQueries(); }} toast={toast} />
      </Drawer>
    </div>
  );
}

function AllSecrets() {
  const collections = useGetWalletCollections();
  const names = (resultOf<Row[]>(collections.data) ?? []).map((c) => String(c.Name));
  const q = useQuery({
    queryKey: ['all-wallet-secrets', names],
    enabled: names.length > 0,
    queryFn: async () => {
      const out: Row[] = [];
      await Promise.all(
        names.map(async (c) => {
          const { data } = await axios.get('/v2/wallet/secrets', { params: { collection: c } });
          (resultOf<Row[]>(data) ?? []).forEach((s) => out.push({ Collection: c, ...s }));
        }),
      );
      return out;
    },
  });
  const rows = q.data ?? [];
  return (
    <DataTable
      columns={[
        { key: 'Collection', header: 'Collection' },
        { key: 'Name', header: 'Secret', className: 'font-mono text-xs' },
        { key: 'Description', header: 'Description', render: (r) => String(r.Description ?? '—') },
      ]}
      rows={rows}
      loading={q.isLoading || collections.isLoading}
      error={q.error}
      rowKey={(r, i) => `${r.Collection}/${r.Name}/${i}`}
      dense
    />
  );
}

function SecretsPanel({
  collection,
  secrets,
  refresh,
  toast,
}: {
  collection: string;
  secrets: { data?: Row[]; isLoading: boolean };
  refresh: () => void;
  toast: (k: 'ok' | 'err', t: string) => void;
}) {
  const [newSecret, setNewSecret] = useState({ name: '', value: '', description: '' });
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const rows = secrets.data ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_1fr] gap-2">
        <Input placeholder="secret name" value={newSecret.name} onChange={(e) => setNewSecret((s) => ({ ...s, name: e.target.value }))} />
        <Input placeholder="value" type="password" value={newSecret.value} onChange={(e) => setNewSecret((s) => ({ ...s, value: e.target.value }))} />
      </div>
      <Button
        size="sm"
        disabled={!newSecret.name || !newSecret.value}
        onClick={async () => {
          try {
            await axios.put(
              '/v2/wallet/secret',
              {
                Type: '%Wallet.KeyValue',
                WalletSecretConfig: {
                  Secret: { value: newSecret.value },
                  Usage: ['CUSTOM'],
                  RequireTLS: true,
                },
              },
              { params: { name: `${collection}.${newSecret.name}` } },
            );
            toast('ok', 'Secret stored');
            setNewSecret({ name: '', value: '', description: '' });
            refresh();
          } catch (e) {
            toast('err', errText(e));
          }
        }}
      >
        <Plus className="h-3.5 w-3.5" /> Add secret
      </Button>
      {secrets.isLoading ? (
        <PageLoader />
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((s, i) => (
              <tr key={i} className="border-b border-ink-800">
                <td className="py-2 font-mono text-xs">{String(s.Name ?? s.SecretName ?? '')}</td>
                <td className="py-2 font-mono text-xs text-ink-400">
                  {revealed[String(s.Name)] ?? '••••••••'}
                </td>
                <td className="w-px py-2 text-right">
                  <span className="inline-flex gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setRevealed((r) => ({ ...r, [String(s.Name)]: 'hidden by API' }))}>
                      <Eye className="h-3 w-3" />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-red-400"
                      onClick={async () => {
                        try {
                          await axios.delete('/v2/wallet/secret', { params: { name: `${collection}.${s.Name}` } });
                          toast('ok', 'Secret deleted');
                          refresh();
                        } catch (e) {
                          toast('err', errText(e));
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="py-6 text-center text-xs text-ink-500">No secrets in this collection</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function X509Page() {
  const { toast } = useToast();
  const [cert, setCert] = useState<{ alias: string; data: Row | null } | null>(null);
  return (
    <>
      <ResourcePage<Row>
        title="X.509 Credentials"
        description="Certificate/key pairs used for TLS and signatures"
        listHook={useGetSecurityX509Credentials as never}
        singlePath="/v2/security/x509-credential"
        nameKey="Alias"
        rowParams={(r) => ({ alias: String(r.Alias) })}
        createParam="alias"
        ops={{
          get: 'getSecurityX509Credential',
          update: 'putSecurityX509Credential',
          delete: 'deleteSecurityX509Credential',
          create: 'postSecurityX509Credential',
        }}
        createLabel="New credential"
        columns={[
          { key: 'Alias', header: 'Alias', className: 'font-mono text-xs' },
          { key: 'Description', header: 'Description', render: (r) => String(r.Description ?? '—') },
          { key: 'CertificateFile', header: 'Cert file', className: 'font-mono text-xs', render: (r) => String(r.CertificateFile ?? r.File ?? '—') },
          { key: 'Owner', header: 'Owner', render: (r) => String(r.Owner ?? '—') },
        ]}
        drawerActions={(r) => (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const { data } = await axios.get('/v2/security/x509-credential/certificate', { params: { alias: r.Alias } });
                setCert({ alias: String(r.Alias), data: resultOf<Row>(data) ?? null });
              } catch (e) {
                toast('err', errText(e));
              }
            }}
          >
            <Eye className="h-3.5 w-3.5" /> View certificate
          </Button>
        )}
      />
      <Drawer open={!!cert} onClose={() => setCert(null)} title={`Certificate: ${cert?.alias}`} wide>
        {cert?.data ? (
          <KeyValueGrid data={cert.data} />
        ) : (
          <pre className="text-xs text-ink-400">No certificate data</pre>
        )}
      </Drawer>
    </>
  );
}

export function OAuth2Page() {
  return (
    <div>
      <PageHeader title="OAuth 2.0" description="Authorization server, resource servers, and client registrations" />
      <Tabs
        tabs={[
          {
            id: 'srv-clients',
            label: 'Server · Clients',
            content: (
              <ResourcePage<Row>
                title=""
                listHook={useGetSecurityOauth2ServerClients as never}
                singlePath="/v2/security/oauth2/server/client"
                nameKey="ClientId"
                rowParams={(r) => ({ clientId: String(r.ClientId ?? r.Name) })}
                createParam="clientId"
                ops={{
                  get: 'getSecurityOauth2ServerClient',
                  update: 'putSecurityOauth2ServerClient',
                  delete: 'deleteSecurityOauth2ServerClient',
                  create: 'postSecurityOauth2ServerClient',
                }}
                createLabel="Register client"
                columns={[
                  { key: 'ClientId', header: 'Client ID', className: 'font-mono text-xs' },
                  { key: 'Name', header: 'Name', render: (r) => String(r.Name ?? '—') },
                  { key: 'ClientType', header: 'Type', render: (r) => <Badge tone="teal">{String(r.ClientType ?? '—')}</Badge> },
                  { key: 'Enabled', header: 'Enabled', render: (r) => String(r.Enabled ?? '—') },
                ]}
              />
            ),
          },
          {
            id: 'res-servers',
            label: 'Resource Servers',
            content: (
              <ResourcePage<Row>
                title=""
                listHook={useGetSecurityOauth2ResourceServers as never}
                singlePath="/v2/security/oauth2/resource-server"
                nameKey="Name"
                ops={{
                  get: 'getSecurityOauth2ResourceServer',
                  update: 'putSecurityOauth2ResourceServer',
                  delete: 'deleteSecurityOauth2ResourceServer',
                  create: 'putSecurityOauth2ResourceServer',
                }}
                createMethod="put"
                createLabel="New resource server"
                columns={[
                  { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
                  { key: 'Description', header: 'Description', render: (r) => String(r.Description ?? '—') },
                ]}
              />
            ),
          },
          {
            id: 'client-defs',
            label: 'Client · Server Definitions',
            content: (
              <ResourcePage<Row>
                title=""
                listHook={useGetSecurityOauth2ClientServerDefinitions as never}
                singlePath="/v2/security/oauth2/client/server-definition"
                nameKey="ID"
                rowParams={(r) => ({ serverId: String(r.ID) })}
                createParam="serverId"
                ops={{
                  get: 'getSecurityOauth2ClientServerDefinition',
                  update: 'putSecurityOauth2ClientServerDefinition',
                  delete: 'deleteSecurityOauth2ClientServerDefinition',
                  create: 'postSecurityOauth2ClientServerDefinition',
                }}
                createLabel="New server definition"
                columns={[
                  { key: 'ID', header: 'Server ID', className: 'font-mono text-xs' },
                  { key: 'IssuerEndpoint', header: 'Issuer', render: (r) => String(r.IssuerEndpoint ?? '—') },
                  { key: 'SSLConfiguration', header: 'TLS', render: (r) => String(r.SSLConfiguration ?? '—') },
                ]}
              />
            ),
          },
          {
            id: 'client-confs',
            label: 'Client · Configurations',
            content: <OAuthClientConfigurations />,
          },
        ]}
      />
    </div>
  );
}

function OAuthClientConfigurations() {
  const definitions = useGetSecurityOauth2ClientServerDefinitions({});
  const servers = resultOf<OAuth2AuthorizationServerListItem[]>(definitions.data) ?? [];
  const [chosenServerId, setChosenServerId] = useState('');
  const serverId = servers.some((server) => server.ID === chosenServerId)
    ? chosenServerId
    : (servers[0]?.ID ?? '');

  if (definitions.isLoading) return <PageLoader />;
  if (definitions.error) {
    return <div className="rounded-lg border border-ink-700 bg-ink-900 p-6 text-sm text-red-400">{errText(definitions.error)}</div>;
  }
  if (!serverId) {
    return (
      <div className="rounded-lg border border-ink-700 bg-ink-900 p-6 text-sm text-ink-300">
        No OAuth client server definitions exist. Create one in the Client · Server Definitions tab before viewing client configurations.
      </div>
    );
  }

  return (
    <div>
      <label className="mb-4 flex items-center gap-3 text-sm text-ink-300">
        Authorization server
        <select
          className="rounded-md border border-ink-700 bg-ink-900 px-3 py-2 text-ink-100"
          value={serverId}
          onChange={(event) => setChosenServerId(event.target.value)}
        >
          {servers.map((server) => <option key={server.ID} value={server.ID}>{server.ID}</option>)}
        </select>
      </label>
      <OAuthClientConfigurationsForServer key={serverId} serverId={serverId} />
    </div>
  );
}

function OAuthClientConfigurationsForServer({ serverId }: { serverId: string }) {
  const list = useGetSecurityOauth2ClientClientConfigurations({ serverId });
  return (
    <ResourcePage<Row>
      title=""
      listHook={() => list as never}
      singlePath="/v2/security/oauth2/client/client-configuration"
      nameKey="ApplicationName"
      rowParams={(row) => ({ applicationName: String(row.ApplicationName ?? row.Name) })}
      createParam="applicationName"
      ops={{
        get: 'getSecurityOauth2ClientClientConfiguration',
        update: 'putSecurityOauth2ClientClientConfiguration',
        delete: 'deleteSecurityOauth2ClientClientConfiguration',
        create: 'putSecurityOauth2ClientClientConfiguration',
      }}
      createMethod="put"
      createLabel="New client configuration"
      columns={[
        { key: 'ApplicationName', header: 'Application', className: 'font-mono text-xs' },
        { key: 'ServerDefinition', header: 'Server def', render: (row) => String(row.ServerDefinition ?? '—') },
        { key: 'ClientType', header: 'Type', render: (row) => String(row.ClientType ?? '—') },
      ]}
    />
  );
}
