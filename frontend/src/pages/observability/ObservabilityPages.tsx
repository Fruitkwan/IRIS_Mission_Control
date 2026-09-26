import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, DatabaseZap, GitCompareArrows, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Button, Card, CardHeader, ErrorState, Select } from '../../components/ui';
import { errText } from '../../lib/errors';
import { useToast } from '../../components/toast-context';
import {
  captureConfigSnapshot, captureMetricSnapshot, deleteConfigSnapshot, diffConfigs, getConfigSnapshot,
  importLegacySnapshots, latestFixPair, legacySnapshotCount, listConfigSnapshots, listMetricSnapshots,
  type ConfigSnapshot, type MetricSnapshot,
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

const STORAGE_NOTE = 'Stored in IRIS and shared by every administrator';

/** Offers to move snapshots saved in this browser by earlier versions into IRIS. */
function LegacyImport({ kind, onDone }: { kind: 'metrics' | 'config'; onDone: () => void }) {
  const { toast } = useToast();
  const [count, setCount] = useState(() => legacySnapshotCount(kind));
  const [busy, setBusy] = useState(false);
  if (!count) return null;
  const move = async () => {
    setBusy(true);
    try {
      const moved = await importLegacySnapshots(kind);
      toast('ok', `Moved ${moved} snapshot${moved === 1 ? '' : 's'} into IRIS`);
      setCount(0);
      onDone();
    } catch (e) {
      toast('err', errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="flex flex-wrap items-center gap-3 p-3 text-xs text-ink-300">
      <DatabaseZap className="h-4 w-4 text-accent-400" />
      This browser has {count} snapshot{count === 1 ? '' : 's'} from an earlier version that only you can see.
      <Button size="xs" variant="outline" loading={busy} onClick={move} className="ml-auto">Move into IRIS</Button>
    </Card>
  );
}

export function TimeMachinePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['snapshots', 'metrics'], queryFn: listMetricSnapshots });
  const snaps = q.data ?? [];
  // null = not chosen yet. Coming from IRIS Doctor after a verified fix, default to
  // comparing that fix's before/after snapshots.
  const [chosenA, setA] = useState<string | null>(null);
  const [chosenB, setB] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pair = latestFixPair(snaps);
  const a = chosenA ?? pair?.[0].id ?? '';
  const b = chosenB ?? pair?.[1].id ?? '';

  const snap = async () => {
    setBusy(true);
    try {
      await captureMetricSnapshot();
      await qc.invalidateQueries({ queryKey: ['snapshots', 'metrics'] });
      toast('ok', 'Snapshot captured');
    } catch (e) {
      toast('err', errText(e));
    } finally {
      setBusy(false);
    }
  };

  const sa = snaps.find((s) => s.id === a);
  const sb = snaps.find((s) => s.id === b);
  const option = (s: MetricSnapshot) => <option key={s.id} value={s.id}>{s.label ? `${s.label} · ` : ''}{fmtDate(s.ts)}</option>;

  return (
    <div className="space-y-4">
      <PageHeader
        title="System Time Machine"
        description="Point-in-time operational snapshots — capture state, compare two moments, see what changed"
        actions={<Button size="sm" loading={busy} onClick={snap}><Camera className="h-3.5 w-3.5" /> Capture snapshot</Button>}
      />

      <LegacyImport kind="metrics" onDone={() => qc.invalidateQueries({ queryKey: ['snapshots', 'metrics'] })} />
      {q.error && <ErrorState error={q.error} retry={() => q.refetch()} />}

      <Card className="flex items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-[11px] text-ink-400">From</label>
          <Select value={a} onChange={(e) => setA(e.target.value)} className="w-64">
            <option value="">— select snapshot —</option>
            {snaps.map(option)}
          </Select>
        </div>
        <GitCompareArrows className="mb-2 h-4 w-4 text-ink-500" />
        <div>
          <label className="mb-1 block text-[11px] text-ink-400">To</label>
          <Select value={b} onChange={(e) => setB(e.target.value)} className="w-64">
            <option value="">— select snapshot —</option>
            {snaps.map(option)}
          </Select>
        </div>
      </Card>

      {sa && sb && (
        <Card>
          <CardHeader title={`What changed? ${fmtDate(sa.ts)} → ${fmtDate(sb.ts)}`} />
          {(sa.assessmentScore !== undefined || sb.assessmentScore !== undefined) && (
            <div className="grid grid-cols-1 gap-px border-b border-ink-800 bg-ink-800 md:grid-cols-2">
              <div className="bg-ink-900 p-3 text-sm">
                <div className="text-[11px] text-ink-500">IRIS Ops assessment</div>
                <div className="mt-1 font-mono">{sa.assessmentScore ?? '—'} → {sb.assessmentScore ?? '—'}</div>
              </div>
              <div className="bg-ink-900 p-3 text-sm">
                <div className="text-[11px] text-ink-500">Change between snapshots</div>
                <div className="mt-1">{sb.phase === 'after' && sb.fix ? `Verified fix: ${sb.fix}` : '—'}</div>
              </div>
            </div>
          )}
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
        <CardHeader title="Snapshots" subtitle={`${STORAGE_NOTE} — capture before/after maintenance to compare`} />
        <DataTable<MetricSnapshot>
          columns={[
            { key: 'ts', header: 'Captured', render: (s) => fmtDate(s.ts) },
            { key: 'label', header: 'Event', render: (s) => s.label ?? 'Manual snapshot' },
            { key: 'createdBy', header: 'By' },
            { key: 'processes', header: 'Processes' },
            { key: 'locks', header: 'Locks' },
            { key: 'globalRefsPerSec', header: 'Gref/s' },
            { key: 'seriousAlerts', header: 'Alerts' },
          ]}
          rows={snaps}
          rowKey={(s) => s.id ?? s.ts}
          onRowClick={(s) => { if (!a) setA(s.id ?? ''); else setB(s.id ?? ''); }}
          empty={<span className="text-xs text-ink-500">{q.isLoading ? 'Loading snapshots…' : 'No snapshots yet — capture one to start the timeline.'}</span>}
          dense
        />
      </Card>
    </div>
  );
}

export function DriftPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['snapshots', 'config'], queryFn: listConfigSnapshots });
  const snaps = q.data ?? [];
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  // Lists carry summaries only; load the two selected snapshots in full.
  const qa = useQuery({ queryKey: ['snapshot', aId], queryFn: () => getConfigSnapshot(aId), enabled: !!aId });
  const qb = useQuery({ queryKey: ['snapshot', bId], queryFn: () => getConfigSnapshot(bId), enabled: !!bId });

  const refresh = () => qc.invalidateQueries({ queryKey: ['snapshots', 'config'] });

  const snap = async () => {
    setBusy(true);
    try {
      await captureConfigSnapshot(`Snapshot ${new Date().toLocaleString()}`);
      await refresh();
      toast('ok', 'Configuration snapshot captured');
    } catch (e) {
      toast('err', errText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteConfigSnapshot(id);
      if (aId === id) setAId('');
      if (bId === id) setBId('');
      await refresh();
    } catch (e) {
      toast('err', errText(e));
    }
  };

  const sa = qa.data;
  const sb = qb.data;
  const allDiff = sa && sb ? diffConfigs(sa, sb) : [];
  const diff = allDiff.filter((l) => !filter || l.section === filter);
  const sections = [...new Set(allDiff.map((l) => l.section))];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Configuration Drift"
        description="Snapshot the security/system configuration and diff any two points in time"
        actions={<Button size="sm" loading={busy} onClick={snap}><Camera className="h-3.5 w-3.5" /> Capture config snapshot</Button>}
      />

      <LegacyImport kind="config" onDone={refresh} />
      {q.error && <ErrorState error={q.error} retry={() => q.refetch()} />}

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
        {(qa.isFetching || qb.isFetching) && <span className="text-xs text-ink-500">Loading snapshot…</span>}
      </Card>

      {(qa.error || qb.error) && <ErrorState error={qa.error ?? qb.error} />}

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
        <CardHeader title="Snapshots" subtitle={STORAGE_NOTE} />
        <DataTable<ConfigSnapshot>
          columns={[
            { key: 'label', header: 'Label' },
            { key: 'ts', header: 'Captured', render: (s) => fmtDate(s.ts) },
            { key: 'createdBy', header: 'By' },
            {
              key: 'x', header: '', className: 'w-10',
              render: (s) => (
                <Button variant="ghost" size="xs" aria-label={`Delete snapshot ${s.label}`} onClick={(e) => { e.stopPropagation(); void remove(s.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ),
            },
          ]}
          rows={snaps}
          rowKey={(s) => s.id}
          onRowClick={(s) => { if (!aId) setAId(s.id); else setBId(s.id); }}
          empty={<span className="text-xs text-ink-500">{q.isLoading ? 'Loading snapshots…' : 'No config snapshots yet.'}</span>}
          dense
        />
      </Card>
    </div>
  );
}
