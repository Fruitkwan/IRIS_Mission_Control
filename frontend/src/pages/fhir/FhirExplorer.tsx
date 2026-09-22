import { useState } from 'react';
import { Play } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Badge, Button, Card, CardHeader, Input, Select } from '../../components/ui';
import { Tabs } from '../../components/Tabs';
import { getEndpoints, fhirRequest } from '../../fhir/store';
import { DEMO_CAPABILITY } from '../../fhir/demo';

type Resp = { status: number; latencyMs: number; data: unknown; headers: Record<string, string> } | null;

function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null || typeof data !== 'object') {
    return <span className="text-teal-300">{JSON.stringify(data)}</span>;
  }
  const entries = Object.entries(data as Record<string, unknown>);
  return (
    <div style={{ marginLeft: depth ? 14 : 0 }}>
      {entries.map(([k, v]) => (
        <div key={k} className="text-xs leading-5">
          <span className="text-accent-300">{k}</span>
          <span className="text-ink-500">: </span>
          {typeof v === 'object' && v !== null ? <JsonTree data={v} depth={depth + 1} /> : <JsonTree data={v} />}
        </div>
      ))}
    </div>
  );
}

export function FhirExplorerPage() {
  const endpoints = getEndpoints();
  const [epId, setEpId] = useState(new URLSearchParams(location.hash.split('?')[1]).get('ep') ?? endpoints[0]?.id);
  const ep = endpoints.find((e) => e.id === epId) ?? endpoints[0];
  const resourceTypes = (((DEMO_CAPABILITY.rest[0].resource) ?? []).map((r) => r.type)) as string[];
  const [rtype, setRtype] = useState('Patient');
  const [op, setOp] = useState<'search' | 'read'>('search');
  const [rid, setRid] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [resp, setResp] = useState<Resp>(null);
  const [running, setRunning] = useState(false);

  const execute = async () => {
    if (!ep) return;
    setRunning(true);
    try {
      const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
      const path = op === 'read' ? `${rtype}/${rid}` : `${rtype}${qs ? '?' + qs : ''}`;
      setResp(await fhirRequest(ep, 'GET', path));
    } finally {
      setRunning(false);
    }
  };

  const searchFields = ['name', 'identifier', 'birthdate', 'gender', 'patient', 'code', 'date', 'status'];

  return (
    <div className="space-y-4">
      <PageHeader title="FHIR Explorer" description="Postman-style FHIR requests — against a real endpoint or the synthetic demo server" />

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-ink-400">Endpoint</label>
            <Select value={ep?.id} onChange={(e) => setEpId(e.target.value)} className="w-64">
              {endpoints.map((e) => (
                <option key={e.id} value={e.id}>{e.label}{e.demo ? ' (demo)' : ''}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-400">Resource</label>
            <Select value={rtype} onChange={(e) => setRtype(e.target.value)} className="w-44">
              {resourceTypes.map((t) => <option key={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-ink-400">Operation</label>
            <Select value={op} onChange={(e) => setOp(e.target.value as 'search')} className="w-32">
              <option value="search">Search</option>
              <option value="read">Read by id</option>
            </Select>
          </div>
          {op === 'read' && (
            <div className="w-44">
              <label className="mb-1 block text-[11px] text-ink-400">Resource id</label>
              <Input value={rid} onChange={(e) => setRid(e.target.value)} placeholder="demo-1" />
            </div>
          )}
          <Button onClick={execute} loading={running} disabled={op === 'read' && !rid}>
            <Play className="h-3.5 w-3.5" /> Execute
          </Button>
        </div>
        {op === 'search' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {searchFields.map((f) => (
              <div key={f}>
                <label className="mb-0.5 block text-[11px] text-ink-500">{f}</label>
                <Input
                  className="h-8 text-xs"
                  value={params[f] ?? ''}
                  onChange={(e) => setParams((s) => ({ ...s, [f]: e.target.value }))}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      {resp && (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Response
                <Badge tone={resp.status < 400 ? 'green' : 'red'}>{resp.status}</Badge>
                <span className="text-xs font-normal text-ink-400">{resp.latencyMs} ms</span>
                {ep?.demo && <Badge tone="purple">synthetic</Badge>}
              </span>
            }
          />
          <Tabs
            tabs={[
              {
                id: 'pretty',
                label: 'Pretty',
                content: <pre className="max-h-[480px] overflow-auto p-4 text-xs font-mono text-ink-200">{JSON.stringify(resp.data, null, 2)}</pre>,
              },
              {
                id: 'tree',
                label: 'Tree',
                content: <div className="max-h-[480px] overflow-auto p-4"><JsonTree data={resp.data} /></div>,
              },
              {
                id: 'headers',
                label: 'Headers',
                content: (
                  <pre className="max-h-[480px] overflow-auto p-4 text-xs font-mono text-ink-300">
                    {Object.entries(resp.headers).map(([k, v]) => `${k}: ${v}`).join('\n') || '—'}
                  </pre>
                ),
              },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
