import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { DataTable } from '../../components/DataTable';
import { Drawer, KeyValueGrid } from '../../components/DetailDrawer';
import { PageHeader } from '../../components/PageHeader';
import { SchemaForm } from '../../components/SchemaForm';
import { Tabs } from '../../components/Tabs';
import { Badge, Button, Card, ErrorState, Input, PageLoader } from '../../components/ui';
import { useToast } from '../../components/toast-context';
import { errText } from '../../lib/errors';
import { requestSchema, resolveSchema } from '../../lib/spec';

type Row = Record<string, unknown>;

function useGet(path: string, key: string) {
  return useQuery({
    queryKey: [key],
    queryFn: () => axios.get(path).then((r) => resultOf<Row>(r.data)),
  });
}

function Settings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Row | null>(null);
  const q = useGet('/v2/security/encryption/settings', 'enc-settings');
  const schema = resolveSchema(requestSchema('putSecurityEncryptionSettings'));
  if (q.isLoading) return <PageLoader />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return (
    <div className="space-y-3">
      <Button size="sm" variant="outline" onClick={() => setForm({ ...(q.data ?? {}) })}>
        Edit
      </Button>
      <KeyValueGrid data={q.data} />
      <Drawer open={!!form} onClose={() => setForm(null)} title="Encryption settings" wide>
        {form && schema && (
          <div className="space-y-4">
            <SchemaForm schema={schema} value={form} onChange={setForm} />
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await axios.put('/v2/security/encryption/settings', form);
                  toast('ok', 'Settings saved');
                  setForm(null);
                  qc.invalidateQueries({ queryKey: ['enc-settings'] });
                } catch (e) {
                  toast('err', errText(e));
                }
              }}
            >
              Save
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Keys() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useGet('/v2/security/encryption/keys', 'enc-keys');
  const rows = (Array.isArray(q.data) ? q.data : (q.data?.Keys as Row[] | undefined) ?? []) as Row[];
  return (
    <div className="space-y-3">
      <DataTable
        columns={[
          { key: 'KeyID', header: 'Key ID', className: 'font-mono text-xs' },
          { key: 'Activated', header: 'Activated', render: (r) => <Badge tone={r.Activated ? 'green' : 'neutral'}>{String(r.Activated ?? '—')}</Badge> },
          { key: 'Description', header: 'Description', render: (r) => String(r.Description ?? '—') },
        ]}
        rows={rows}
        loading={q.isLoading}
        error={q.error}
        rowKey={(r, i) => String(r.KeyID ?? i)}
        dense
      />
      <DeactivateKey />
    </div>
  );

  function DeactivateKey() {
    const [kid, setKid] = useState('');
    return (
      <div className="flex items-end gap-2">
        <div>
          <label className="mb-1 block text-[11px] text-ink-400">Deactivate key ID</label>
          <Input className="h-8 w-64 text-xs" value={kid} onChange={(e) => setKid(e.target.value)} placeholder="key GUID" />
        </div>
        <Button
          size="sm"
          variant="danger"
          disabled={!kid}
          onClick={async () => {
            try {
              await axios.post('/v2/security/encryption/key/deactivate', null, { params: { keyId: kid } });
              toast('ok', 'Key deactivated');
              qc.invalidateQueries({ queryKey: ['enc-keys'] });
            } catch (e) {
              toast('err', errText(e));
            }
          }}
        >
          Deactivate
        </Button>
      </div>
    );
  }
}

function Files() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState('');
  const [admins, setAdmins] = useState<Row[] | null>(null);
  const [keys, setKeys] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const { data } = await axios.post(path, body ?? null, { params: { file } });
      toast('ok', `${path.split('/').pop()} done`);
      qc.invalidateQueries();
      return data;
    } catch (e) {
      toast('err', errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-end gap-2 p-4">
        <div className="min-w-64 flex-1">
          <label className="mb-1 block text-[11px] text-ink-400">Key file path (on server)</label>
          <Input value={file} onChange={(e) => setFile(e.target.value)} placeholder="/usr/irissys/mgr/keys.key" className="font-mono text-xs" />
        </div>
        <Button size="sm" variant="outline" disabled={!file || busy} onClick={async () => {
          const d = await run('/v2/security/encryption/file/admins');
          setAdmins((resultOf<Row[]>(d) ?? null) as Row[] | null);
        }}>
          List admins
        </Button>
        <Button size="sm" variant="outline" disabled={!file || busy} onClick={async () => {
          const res = await axios.get('/v2/security/encryption/file/keys', { params: { file } }).catch((e) => { toast('err', errText(e)); return null; });
          if (res) setKeys((resultOf<Row[]>(res.data) ?? null) as Row[] | null);
        }}>
          List keys
        </Button>
        <Button size="sm" variant="outline" disabled={!file || busy} onClick={() => run('/v2/security/encryption/file/activate')}>
          Activate file
        </Button>
      </Card>
      {admins && (
        <Card className="p-3">
          <p className="mb-2 text-xs font-semibold">File admins</p>
          <KeyValueGrid data={Object.fromEntries(admins.map((a, i) => [`admin ${i + 1}`, a]))} />
        </Card>
      )}
      {keys && (
        <Card className="p-3">
          <p className="mb-2 text-xs font-semibold">Keys in file</p>
          <KeyValueGrid data={Object.fromEntries(keys.map((k, i) => [`key ${i + 1}`, k]))} />
        </Card>
      )}
    </div>
  );
}

function DataElementKeys() {
  const q = useGet('/v2/security/encryption/data-element-keys', 'de-keys');
  const rows = (Array.isArray(q.data) ? q.data : (q.data?.Keys as Row[] | undefined) ?? []) as Row[];
  return (
    <DataTable
      columns={[
        { key: 'Name', header: 'Name', className: 'font-mono text-xs' },
        { key: 'Description', header: 'Description', render: (r) => String(r.Description ?? '—') },
      ]}
      rows={rows}
      loading={q.isLoading}
      error={q.error}
      rowKey={(r, i) => String(r.Name ?? i)}
      dense
    />
  );
}

export function EncryptionPage() {
  return (
    <div>
      <PageHeader title="Encryption" description="Data-element keys, key files, and encryption settings" />
      <Tabs
        tabs={[
          { id: 'keys', label: 'Keys', content: <Keys /> },
          { id: 'files', label: 'Key Files', content: <Files /> },
          { id: 'de', label: 'Data-Element Keys', content: <DataElementKeys /> },
          { id: 'settings', label: 'Settings', content: <Settings /> },
        ]}
      />
    </div>
  );
}
