import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { Drawer, KeyValueGrid } from '../../components/DetailDrawer';
import { SchemaForm } from '../../components/SchemaForm';
import { Badge, Button, Card, ErrorState, Input, PageLoader } from '../../components/ui';
import { useToast, errText } from '../../components/toast';
import { requestSchema, resolveSchema } from '../../lib/spec';
import { ResourcePage } from '../ResourcePage';
import { PageHeader } from '../../components/PageHeader';
import { useGetSecurityLdapConfigurations } from '../../api/generated/security/security';
import { useGetSecuritySslConfigurations } from '../../api/generated/security/security';
import { useGetSecurityMftConnections } from '../../api/generated/security/security';

type Row = Record<string, unknown>;

export function LdapPage() {
  const [testName, setTestName] = useState<string | null>(null);
  const [testUser, setTestUser] = useState('');
  const [testPw, setTestPw] = useState('');
  const [testResult, setTestResult] = useState('');

  return (
    <>
      <ResourcePage<Row>
        title="LDAP Configurations"
        description="LDAP / Active Directory authentication"
        listHook={useGetSecurityLdapConfigurations as never}
        singlePath="/v2/security/ldap/configuration"
        nameKey="Name"
        ops={{
          get: 'getSecurityLdapConfiguration',
          update: 'putSecurityLdapConfiguration',
          delete: 'deleteSecurityLdapConfiguration',
          create: 'putSecurityLdapConfiguration',
        }}
        createMethod="put"
        createLabel="New LDAP config"
        columns={[
          { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
          { key: 'Enabled', header: 'Enabled', render: (r) => <Badge tone={r.Enabled ? 'green' : 'neutral'}>{r.Enabled ? 'yes' : 'no'}</Badge> },
          { key: 'Description', header: 'Description', render: (r) => String(r.Description ?? '—') },
          { key: 'LDAPCACertFile', header: 'CA cert', render: (r) => String(r.LDAPCACertFile ?? '—') },
        ]}
        rowActions={(r) => (
          <Button size="xs" variant="ghost" title="Test connection" onClick={() => { setTestName(String(r.Name)); setTestResult(''); }}>
            <FlaskConical className="h-3 w-3" />
          </Button>
        )}
      />
      <Drawer open={!!testName} onClose={() => setTestName(null)} title={`Test LDAP: ${testName}`}>
        <div className="space-y-3">
          <label className="block text-xs text-ink-400">Username</label>
          <Input value={testUser} onChange={(e) => setTestUser(e.target.value)} />
          <label className="block text-xs text-ink-400">Password</label>
          <Input type="password" value={testPw} onChange={(e) => setTestPw(e.target.value)} />
          <Button
            size="sm"
            onClick={async () => {
              try {
                const { data } = await axios.post('/v2/security/ldap/test', {
                  name: testName,
                  username: testUser,
                  password: testPw,
                });
                setTestResult(JSON.stringify(resultOf(data) ?? data, null, 2));
              } catch (e) {
                setTestResult(errText(e));
              }
            }}
          >
            Test
          </Button>
          {testResult && (
            <pre className="rounded-md bg-ink-850 p-3 text-xs text-ink-200 whitespace-pre-wrap">{testResult}</pre>
          )}
        </div>
      </Drawer>
    </>
  );
}

export function SslPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  return (
    <ResourcePage<Row>
      title="SSL / TLS Configurations"
      description="TLS profiles for inbound and outbound connections"
      listHook={useGetSecuritySslConfigurations as never}
      singlePath="/v2/security/ssl-configuration"
      nameKey="Name"
      ops={{
        get: 'getSecuritySslConfiguration',
        update: 'putSecuritySslConfiguration',
        delete: 'deleteSecuritySslConfiguration',
        create: 'putSecuritySslConfiguration',
      }}
      createMethod="put"
      createLabel="New TLS config"
      columns={[
        { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
        { key: 'Description', header: 'Description', render: (r) => String(r.Description ?? '—') },
        { key: 'Type', header: 'Type' },
        { key: 'Enabled', header: 'Enabled', render: (r) => <Badge tone={r.Enabled ? 'green' : 'neutral'}>{r.Enabled ? 'yes' : 'no'}</Badge> },
      ]}
      rowActions={(r) => (
        <Button
          size="xs"
          variant="ghost"
          title="Test config"
          onClick={async () => {
            try {
              const { data } = await axios.post('/v2/security/ssl-configuration/test', null, {
                params: { name: r.Name },
              });
              toast('ok', `Test ${r.Name}: ${JSON.stringify(resultOf(data) ?? 'ok').slice(0, 120)}`);
              qc.invalidateQueries();
            } catch (e) {
              toast('err', errText(e));
            }
          }}
        >
          <FlaskConical className="h-3 w-3" />
        </Button>
      )}
    />
  );
}

export function WebAuthPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ['web-auth'],
    queryFn: () => axios.get('/v2/security/web-auth').then((r) => resultOf<Row>(r.data)),
  });
  const schema = resolveSchema(requestSchema('putSecurityWebAuth'));

  return (
    <div>
      <PageHeader title="Web Authentication" description="Instance-wide web authentication methods" />
      <Card className="max-w-2xl p-4">
        {q.isLoading && <PageLoader />}
        {q.error && <ErrorState error={q.error} retry={() => q.refetch()} />}
        {q.data && (
          <>
            <div className="mb-3 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setForm({ ...q.data })}>
                Edit
              </Button>
            </div>
            <KeyValueGrid data={q.data} />
          </>
        )}
      </Card>
      <Drawer open={!!form} onClose={() => setForm(null)} title="Web authentication settings" wide>
        {form && schema && (
          <div className="space-y-4">
            <SchemaForm schema={schema} value={form} onChange={setForm} />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    await axios.put('/v2/security/web-auth', form);
                    toast('ok', 'Web auth updated');
                    setForm(null);
                    qc.invalidateQueries({ queryKey: ['web-auth'] });
                  } catch (e) {
                    toast('err', errText(e));
                  }
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setForm(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export function MftPage() {
  return (
    <ResourcePage<Row>
      title="MFT Connections"
      description="Managed File Transfer service connections (Box, Dropbox, Kiteworks…)"
      listHook={useGetSecurityMftConnections as never}
      singlePath="/v2/security/mft/connection"
      nameKey="Name"
      rowParams={(r) => ({ connection: String(r.Name) })}
      createParam="connection"
      ops={{
        get: 'getSecurityMftConnection',
        update: 'putSecurityMftConnection',
        delete: 'deleteSecurityMftConnection',
        create: 'putSecurityMftConnection',
      }}
      createMethod="put"
      createLabel="New MFT connection"
      columns={[
        { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
        { key: 'Service', header: 'Service', render: (r) => String(r.Service ?? '—') },
        { key: 'SSLConfiguration', header: 'TLS', render: (r) => String(r.SSLConfiguration ?? '—') },
        { key: 'Authorized', header: 'Authorized', render: (r) => <Badge tone={r.Authorized ? 'green' : 'neutral'}>{String(r.Authorized ?? '—')}</Badge> },
      ]}
    />
  );
}
