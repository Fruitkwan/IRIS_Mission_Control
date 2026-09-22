import { useState } from 'react';
import { Camera, GitCompareArrows, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Button, Card, CardHeader, Select } from '../../components/ui';
import { useToast } from '../../components/toast';
import {
  captureConfigSnapshot, captureMetricSnapshot, deleteConfigSnapshot, diffConfigs,
  getConfigSnapshots, getMetricSnapshots, type ConfigSnapshot, type MetricSnapshot,
} from '../../observability/snapshots';
import { fmtDate } from '../../lib/utils';
import { cn } from '../../lib/utils';

const METRIC_LABELS: [keyof MetricSnapshot, string][] = [
  ['globalRefsPerSec', 'Global refs/sec'],
  ['diskReads', 'Disk reads'],
  ['diskWrites', 'Disk writes'],
  ['cacheEfficiency', 'Cache efficiency %'],
  ['processes', 'Processes'],
  ['locks', 'Locks'],
  ['journalEntries', 'Journal entries'],
  ['seriousAlerts', 'Serious alerts'],
  ['appErrors', 'App errors'],
  ['licenseUse', 'License use'],
  ['cspSessions', 'CSP sessions'],
];

export function TimeMachinePage() {
  const { toast } = useToast();
  const [snaps, setSnaps] = useState(getMetricSnapshots());
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const snap = async () => {
    setBusy(true);
    await captureMetricSnapshot();
    setSnaps(getMetricSnapshots());
    setBusy(false);
    toast('ok', 'Snapshot captured');
  };

  const sa = snaps.find((s) => s.ts === a);
  const sb = snaps.find((s) => s.ts === b);

  return (
    <div className="space-y-4">
      <PageHeader
        title="System Time Machine"
        description="Point-in-time operational snapshots — capture state, compare two moments, see what changed"
        actions={<Button size="sm" loading={busy} onClick={snap}><Camera className="h-3.5 w-3.5" /> Capture snapshot</Button>}
      />

      <Card className="flex items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-[11px] text-ink-400">From</label>
          <Select value={a} onChange={(e) => setA(e.target.value)} className="w-64">
            <option value="">— select snapshot —</option>
            {snaps.map((s) => <option key={s.ts} value={s.ts}>{fmtDate(s.ts)}</option>)}
          </Select>
        </div>
        <GitCompareArrows className="mb-2 h-4 w-4 text-ink-500" />
        <div>
          <label className="mb-1 block text-[11px] text-ink-400">To</label>
          <Select value={b} onChange={(e) => setB(e.target.value)} className="w-64">
            <option value="">— select snapshot —</option>
            {snaps.map((s) => <option key={s.ts} value={s.ts}>{fmtDate(s.ts)}</option>)}
          </Select>
        </div>
      </Card>

      {sa && sb && (
        <Card>
          <CardHeader title={`What changed? ${fmtDate(sa.ts)} → ${fmtDate(sb.ts)}`} />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-px bg-ink-800">
            {METRIC_LABELS.map(([key, label]) => {
              const va = sa[key] as number | undefined;
              const vb = sb[key] as number | undefined;
              const delta = typeof va === 'number' && typeof vb === 'number' ? vb - va : undefined;
              const changed = delta !== undefined && delta !== 0;
              return (
                <div key={key} className={cn('bg-ink-900 p-3', changed && 'bg-accent-500/5')}>
                  <div className="text-[11px] text-ink-500">{label}</div>
                  <div className="mt-1 font-mono text-sm">
                    {va ?? '—'} <span className="text-ink-600">→</span> {vb ?? '—'}
                    {changed && (
                      <span className={cn('ml-2 text-[11px]', delta! > 0 ? 'text-amber-400' : 'text-emerald-400')}>
                        {delta! > 0 ? '+' : ''}{typeof delta === 'number' && !Number.isInteger(delta) ? delta.toFixed(1) : delta}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Snapshots" subtitle="Stored locally in the browser — capture before/after maintenance to compare" />
        <DataTable<MetricSnapshot>
          columns={[
            { key: 'ts', header: 'Captured', render: (s) => fmtDate(s.ts) },
            { key: 'processes', header: 'Processes' },
            { key: 'locks', header: 'Locks' },
            { key: 'globalRefsPerSec', header: 'Gref/s' },
            { key: 'seriousAlerts', header: 'Alerts' },
          ]}
          rows={snaps}
          rowKey={(s) => s.ts}
          onRowClick={(s) => { if (!a) setA(s.ts); else setB(s.ts); }}
          empty={<span className="text-xs text-ink-500">No snapshots yet — capture one to start the timeline.</span>}
          dense
        />
      </Card>
    </div>
  );
}

export function DriftPage() {
  const { toast } = useToast();
  const [snaps, setSnaps] = useState(getConfigSnapshots());
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const snap = async () => {
    setBusy(true);
    await captureConfigSnapshot(`Snapshot ${new Date().toLocaleString()}`);
    setSnaps(getConfigSnapshots());
    setBusy(false);
    toast('ok', 'Configuration snapshot captured');
  };

  const sa = snaps.find((s) => s.id === aId);
  const sb = snaps.find((s) => s.id === bId);
  const diff = sa && sb ? diffConfigs(sa, sb).filter((l) => !filter || l.section === filter) : [];
  const sections = sa && sb ? [...new Set(diffConfigs(sa, sb).map((l) => l.section))] : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Configuration Drift"
        description="Snapshot the security/system configuration and diff any two points in time"
        actions={<Button size="sm" loading={busy} onClick={snap}><Camera className="h-3.5 w-3.5" /> Capture config snapshot</Button>}
      />

      <Card className="flex items-end gap-3 p-4 flex-wrap">
        <Select value={aId} onChange={(e) => setAId(e.target.value)} className="w-64">
          <option value="">— baseline —</option>
          {snaps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        <Select value={bId} onChange={(e) => setBId(e.target.value)} className="w-64">
          <option value="">— comparison —</option>
          {snaps.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </Select>
        {sections.length > 0 && (
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-44">
            <option value="">all sections</option>
            {sections.map((s) => <option key={s}>{s}</option>)}
          </Select>
        )}
      </Card>

      {sa && sb && (
        <Card>
          <CardHeader title={`Drift: ${sa.label} → ${sb.label}`} subtitle={`${diff.length} difference${diff.length === 1 ? '' : 's'}`} />
          <div className="max-h-[480px] overflow-auto p-3 font-mono text-xs space-y-0.5">
            {diff.length === 0 && <p className="p-4 text-center text-emerald-400 font-sans text-sm">Identical — no drift detected.</p>}
            {diff.map((l, i) => (
              <div key={i} className={cn(
                'rounded px-2 py-1',
                l.kind === '+' && 'bg-emerald-500/10 text-emerald-300',
                l.kind === '-' && 'bg-red-500/10 text-red-300',
                l.kind === '~' && 'bg-amber-500/10 text-amber-300',
              )}>
                <span className="text-ink-500">[{l.section}]</span> {l.kind} {l.text}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader title="Snapshots" />
        <DataTable<ConfigSnapshot>
          columns={[
            { key: 'label', header: 'Label' },
            { key: 'ts', header: 'Captured', render: (s) => fmtDate(s.ts) },
            {
              key: 'x', header: '', className: 'w-10',
              render: (s) => (
                <Button variant="ghost" size="xs" onClick={(e) => { e.stopPropagation(); deleteConfigSnapshot(s.id); setSnaps(getConfigSnapshots()); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ),
            },
          ]}
          rows={snaps}
          rowKey={(s) => s.id}
          onRowClick={(s) => { if (!aId) setAId(s.id); else setBId(s.id); }}
          empty={<span className="text-xs text-ink-500">No config snapshots yet.</span>}
          dense
        />
      </Card>
    </div>
  );
}
