import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { HeartPulse, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader';
import { Badge, Button, Card, CardHeader, EmptyState, Input, PageLoader } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useGetWebApps } from '../../api/generated/web-app/web-app';
import { resultOf } from '../../api/helpers';
import {
  addEndpoint, discoverFromWebApps, getEndpoints, probeEndpoint, removeEndpoint,
  type ProbeResult,
} from '../../fhir/store';

export function FhirServersPage() {
  const { toast } = useToast();
  const [endpoints, setEndpoints] = useState(getEndpoints());
  const [newBase, setNewBase] = useState('');
  const webApps = useGetWebApps();
  const discovered = discoverFromWebApps(resultOf<Record<string, unknown>[]>(webApps.data) ?? []);

  const probes = useQuery({
    queryKey: ['fhir-probes', endpoints.map((e) => e.base).join(',')],
    queryFn: async () => {
      const out: Record<string, ProbeResult> = {};
      await Promise.all(endpoints.map(async (e) => (out[e.id] = await probeEndpoint(e))));
      return out;
    },
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="FHIR Control Center"
        description="FHIR endpoints discovered on this IRIS instance — health, version, capability and latency"
        actions={
          <Button size="sm" variant="ghost" loading={probes.isFetching} onClick={() => probes.refetch()}>
            <RefreshCw className="h-3.5 w-3.5" /> Re-probe
          </Button>
        }
      />

      {/* Discovery + add */}
      <Card className="p-4 space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 max-w-md">
            <label className="mb-1 block text-[11px] text-ink-400">Add endpoint (e.g. /fhir/r4)</label>
            <Input value={newBase} onChange={(e) => setNewBase(e.target.value)} placeholder="/fhir/r4" />
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (!newBase.trim()) return;
              addEndpoint(newBase.trim());
              setEndpoints(getEndpoints());
              setNewBase('');
              toast('ok', 'Endpoint added');
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        {discovered.length > 0 && (
          <div className="text-xs text-ink-400">
            Discovered web apps:{' '}
            {discovered.map((d) => (
              <button
                key={d}
                className="mr-2 text-accent-400 hover:text-accent-300 font-mono"
                onClick={() => { addEndpoint(d); setEndpoints(getEndpoints()); }}
              >
                + {d}
              </button>
            ))}
          </div>
        )}
        {discovered.length === 0 && (
          <p className="text-xs text-ink-500">
            No /fhir* web applications found on this instance — typical on IRIS Community Edition.
            On IRIS for Health, discovered endpoints appear here automatically. Use the bundled
            synthetic demo server below, or add an endpoint manually.
          </p>
        )}
      </Card>

      {probes.isLoading && <PageLoader />}

      <div className="grid gap-4 md:grid-cols-2">
        {endpoints.map((ep) => {
          const p = probes.data?.[ep.id];
          return (
            <Card key={ep.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <HeartPulse className={p?.ok ? 'text-emerald-400' : 'text-ink-500'} size={18} />
                  <div>
                    <h3 className="text-sm font-semibold">{ep.label}</h3>
                    <p className="text-xs font-mono text-ink-400">{ep.base}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {ep.demo && <Badge tone="purple">demo</Badge>}
                  {p && <Badge tone={p.ok ? 'green' : 'red'}>{p.ok ? 'healthy' : 'offline'}</Badge>}
                  {!ep.demo && (
                    <Button
                      variant="ghost" size="xs"
                      onClick={() => { removeEndpoint(ep.id); setEndpoints(getEndpoints()); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {p?.ok && p.capability && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-ink-700 p-2">
                    <div className="text-ink-500">FHIR version</div>
                    <div className="mt-0.5 font-mono">{String((p.capability as { fhirVersion?: string }).fhirVersion)}</div>
                  </div>
                  <div className="rounded border border-ink-700 p-2">
                    <div className="text-ink-500">Resources</div>
                    <div className="mt-0.5 font-mono">
                      {(((p.capability as { rest?: { resource?: unknown[] }[] }).rest?.[0]?.resource) ?? []).length} types
                    </div>
                  </div>
                  <div className="rounded border border-ink-700 p-2">
                    <div className="text-ink-500">Latency</div>
                    <div className="mt-0.5 font-mono">{p.latencyMs} ms</div>
                  </div>
                  <div className="rounded border border-ink-700 p-2">
                    <div className="text-ink-500">CapabilityStatement</div>
                    <div className="mt-0.5 text-emerald-400">✓ available</div>
                  </div>
                </div>
              )}
              {p && !p.ok && <p className="mt-3 text-xs text-red-400">{p.error}</p>}
              <div className="mt-3 flex gap-3 text-xs">
                <Link to={`/fhir/explorer?ep=${ep.id}`} className="text-accent-400 hover:text-accent-300">Explorer →</Link>
                <Link to={`/fhir/capability?ep=${ep.id}`} className="text-accent-400 hover:text-accent-300">Capability →</Link>
                <Link to={`/fhir/validate?ep=${ep.id}`} className="text-accent-400 hover:text-accent-300">Validate →</Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function FhirCapabilityPage() {
  const [epId] = useState(() => new URLSearchParams(location.hash.split('?')[1]).get('ep') ?? 'demo');
  const ep = getEndpoints().find((e) => e.id === epId) ?? getEndpoints()[0];
  const probe = useQuery({ queryKey: ['fhir-cap', ep?.id], queryFn: () => probeEndpoint(ep!), enabled: !!ep });
  const [filter, setFilter] = useState('');

  const resources = (((probe.data?.capability as { rest?: { resource?: Record<string, unknown>[] }[] })?.rest?.[0]?.resource) ?? [])
    .filter((r) => String(r.type).toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="space-y-4">
      <PageHeader
        title="FHIR Capability"
        description={`CapabilityStatement for ${ep?.label ?? ''}`}
        actions={
          <Input className="w-64 h-8" placeholder="Filter resources…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        }
      />
      {probe.isLoading && <PageLoader />}
      {probe.data && !probe.data.ok && (
        <EmptyState title="CapabilityStatement unavailable" hint={probe.data.error} />
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {resources.map((r) => (
          <Card key={String(r.type)} className="p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold font-mono">{String(r.type)}</span>
              <Badge tone="teal">{((r.interaction as { code: string }[]) ?? []).length} ops</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {((r.interaction as { code: string }[]) ?? []).map((i) => (
                <Badge key={i.code} tone="neutral" className="font-mono">{i.code}</Badge>
              ))}
            </div>
            {Array.isArray(r.searchParam) && r.searchParam.length > 0 && (
              <div className="mt-2 text-[11px] text-ink-500">
                search: {(r.searchParam as { name: string }[]).map((s) => s.name).join(', ')}
              </div>
            )}
          </Card>
        ))}
      </div>
      {probe.data?.ok && (
        <Card>
          <CardHeader title="Raw CapabilityStatement" />
          <pre className="max-h-80 overflow-auto p-4 text-[11px] font-mono text-ink-300">
            {JSON.stringify(probe.data.capability, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
