import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cloud, CloudOff, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Drawer } from '../../components/DetailDrawer';
import { Badge, Button, Card, Input, Select } from '../../components/ui';
import { useToast } from '../../components/toast';
import {
  getConnections, removeConnection, testConnection, upsertConnection,
  PROVIDER_FIELDS, PROVIDER_LABEL, type CloudConnection, type TestResult,
} from '../../cloud/providers';
import { fmtDate } from '../../lib/utils';

const STATUS_TONE = { connected: 'green', warning: 'amber', disconnected: 'red', 'not-configured': 'neutral' } as const;

function ConnectionCard({ c, onChanged }: { c: CloudConnection; onChanged: () => void }) {
  const [testing, setTesting] = useState(false);
  const [res, setRes] = useState<TestResult | null>(null);
  const test = async () => {
    setTesting(true);
    const r = await testConnection(c);
    r && setRes(r);
    c.status = r.status;
    c.lastCheckedAt = new Date().toISOString();
    c.lastError = r.status === 'connected' ? undefined : r.detail;
    upsertConnection(c);
    setTesting(false);
    onChanged();
  };
  const status = res?.status ?? c.status ?? 'not-configured';
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {status === 'connected' ? <Cloud className="h-4.5 w-4.5 text-emerald-400" size={18} /> : <CloudOff className="h-4.5 w-4.5 text-ink-500" size={18} />}
          <div>
            <h3 className="text-sm font-semibold">{c.name}</h3>
            <p className="text-xs text-ink-500">{PROVIDER_LABEL[c.provider]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={STATUS_TONE[status]}>{status}</Badge>
          {c.provider !== 'iris' && (
            <Button variant="ghost" size="xs" onClick={() => { removeConnection(c.id); onChanged(); }}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-400">{res?.detail || c.lastError || 'Not tested yet'}</p>
      {c.lastCheckedAt && <p className="mt-1 text-[11px] text-ink-500">Last check: {fmtDate(c.lastCheckedAt)}</p>}
      {res?.secrets && res.secrets.length > 0 && (
        <p className="mt-1 text-[11px] text-ink-400">{res.secrets.length} secret(s) visible as metadata</p>
      )}
      <div className="mt-3">
        <Button size="xs" variant="outline" loading={testing} onClick={test}>Test connection</Button>
      </div>
    </Card>
  );
}

function NewConnectionDrawer({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<'azure' | 'aws' | 'gcp'>('azure');
  const [name, setName] = useState('');
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const fields = PROVIDER_FIELDS[provider] ?? [];
  return (
    <Drawer open={open} onClose={onClose} title="New cloud connection">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-ink-400">Provider</label>
          <Select value={provider} onChange={(e) => { setProvider(e.target.value as 'azure'); setCfg({}); }} className="w-full">
            <option value="azure">Azure Key Vault</option>
            <option value="aws">AWS Secrets Manager</option>
            <option value="gcp">Google Cloud Secret Manager</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-400">Display name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={PROVIDER_LABEL[provider]} />
        </div>
        {fields.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-xs text-ink-400">{f.label}</label>
            <Input value={cfg[f.key] ?? ''} onChange={(e) => setCfg((s) => ({ ...s, [f.key]: e.target.value }))} placeholder={f.hint} />
          </div>
        ))}
        <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5" />
          Credentials are referenced from the IRIS wallet — never typed into or stored by this UI.
        </p>
        <Button
          onClick={() => {
            upsertConnection({
              id: `c-${Date.now()}`, provider, name: name || PROVIDER_LABEL[provider],
              config: cfg, status: 'not-configured',
            });
            toast('ok', 'Connection saved');
            onSaved();
            onClose();
          }}
        >
          Save connection
        </Button>
      </div>
    </Drawer>
  );
}

export function CloudOverviewPage() {
  const [connections, setConnections] = useState(getConnections());
  const [drawer, setDrawer] = useState(false);
  const refresh = () => setConnections(getConnections());
  return (
    <div className="space-y-4">
      <PageHeader
        title="Cloud Integrations"
        description="Multi-cloud secret providers — credentials stay server-side; only metadata is shown"
        actions={<Button size="sm" onClick={() => setDrawer(true)}><Plus className="h-3.5 w-3.5" /> New connection</Button>}
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {connections.map((c) => (
          <ConnectionCard key={c.id} c={c} onChanged={refresh} />
        ))}
      </div>
      <NewConnectionDrawer open={drawer} onClose={() => setDrawer(false)} onSaved={refresh} />
    </div>
  );
}

export function CloudSecretsPage() {
  const secrets = useQuery({
    queryKey: ['cloud-secrets'],
    queryFn: async () => {
      const out: { provider: string; name: string; collection?: string; status: string }[] = [];
      for (const c of getConnections()) {
        const r = await testConnection(c);
        for (const s of r.secrets ?? []) out.push(s);
      }
      return out;
    },
  });
  return (
    <div className="space-y-4">
      <PageHeader
        title="Cloud Secrets"
        description="Secret metadata across providers — values are never fetched or displayed"
        actions={<Button size="sm" variant="ghost" loading={secrets.isFetching} onClick={() => secrets.refetch()}><RefreshCw className="h-3.5 w-3.5" /></Button>}
      />
      <DataTable
        columns={[
          { key: 'provider', header: 'Provider', render: (r) => <Badge tone="teal">{String(r.provider)}</Badge> },
          { key: 'name', header: 'Secret name', className: 'font-mono text-xs' },
          { key: 'collection', header: 'Collection', render: (r) => String(r.collection ?? '—') },
          { key: 'status', header: 'Status', render: (r) => <Badge tone="green">{String(r.status)}</Badge> },
        ]}
        rows={secrets.data}
        loading={secrets.isLoading}
        rowKey={(r, i) => `${r.provider}-${r.collection}-${r.name}-${i}`}
        empty={<span className="text-xs text-ink-500">No secrets visible. Test a connection on the Overview page first.</span>}
      />
      <p className="text-[11px] text-ink-500">
        <ShieldCheck className="mr-1 inline h-3 w-3" />
        Secret values never leave the server-side store. This view shows names and metadata only.
      </p>
    </div>
  );
}
