import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Download, History, Loader2, Search, Stethoscope } from 'lucide-react';
import { errText } from '../../lib/errors';
import { PageHeader } from '../../components/PageHeader';
import { Badge, Button, Card, Input } from '../../components/ui';
import { Drawer } from '../../components/DetailDrawer';
import { FindingCard } from '../../components/FindingCard';
import { FindingDetail } from '../../components/FindingDetail';
import { runDiagnostics } from '../../health/engine';
import type { AuditEntry, Remediation } from '../../health/remediation';
import { remediationHistory, type RemediationRecord } from '../../health/remediationAudit';
import type { Finding, HealthReport } from '../../health/types';
import { cn, fmtDate } from '../../lib/utils';
import { saveDoctorSnapshot } from '../../observability/snapshots';

function exportReport(r: HealthReport) {
  const lines = [
    '# IRIS Doctor — Diagnostic Report',
    `Generated: ${r.generatedAt}`,
    `IRIS Ops assessment: ${r.overall}/100`,
    r.scoreMethod,
    '',
    `Critical: ${r.summary.critical} · Warnings: ${r.summary.warning} · Info: ${r.summary.info} · Recommendations: ${r.summary.recommendation}`,
    '',
    '## Findings',
    '',
    ...r.findings.flatMap((f) => [
      `### [${f.severity.toUpperCase()}] ${f.title}`,
      f.description,
      '',
      'Evidence:',
      ...f.evidence.map((e) => `- ${e.label}: ${e.value}`),
      ...(f.recommendation ? ['', `Recommendation: ${f.recommendation}`] : []),
      '',
    ]),
    ...(r.collectorErrors.length
      ? ['## Collector errors', '', ...r.collectorErrors.map((e) => `- ${e.collector}: ${e.error}`)]
      : []),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `iris-doctor-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** An audit record this page just wrote; IRIS can take up to about a minute to expose it to SQL. */
type PendingRecord = { entry: AuditEntry; at: number };

const matches = (r: RemediationRecord, p: PendingRecord) =>
  r.action === p.entry.action && r.data?.ruleId === p.entry.ruleId && r.data?.target === p.entry.target &&
  Date.parse(r.timestamp) >= p.at - 60_000;

function RemediationHistory({ pending }: { pending: PendingRecord[] }) {
  const q = useQuery({
    queryKey: ['remediation-history'],
    queryFn: remediationHistory,
    // Poll while a record this page wrote has not appeared yet.
    refetchInterval: (query) => (pending.some((p) => !(query.state.data ?? []).some((r) => matches(r, p))) ? 10_000 : false),
  });
  const records = q.data ?? [];
  const unconfirmed = pending.filter((p) => !records.some((r) => matches(r, p)));
  if (q.error) return <p className="text-xs text-ink-500">Change history unavailable: {errText(q.error)}</p>;
  if (!records.length && !unconfirmed.length) return null;
  return (
    <Card className="p-4">
      <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-400">
        <History className="h-3.5 w-3.5" /> Change history · IRIS audit log
      </h4>
      <ul className="space-y-1.5 text-xs">
        {unconfirmed.map((p) => (
          <li key={`pending-${p.at}`} className="flex flex-wrap items-baseline gap-x-2 text-ink-300">
            <span className="font-mono text-ink-500">{fmtDate(new Date(p.at).toISOString())}</span>
            <Badge tone={p.entry.action === 'Rollback' ? 'amber' : 'green'}>{p.entry.action}</Badge>
            <span>{p.entry.target}</span>
            <span className="text-ink-500">{p.entry.changes.map((c) => `${c.field}: ${c.before} → ${c.after}`).join(' · ')}</span>
            <span className="ml-auto text-ink-500" title="IRIS accepted the audit record; it appears in audit queries within about a minute">recorded · appearing shortly</span>
          </li>
        ))}
        {records.slice(0, 10).map((r) => (
          <li key={r.timestamp + r.action + r.description} className="flex flex-wrap items-baseline gap-x-2 text-ink-300">
            <span className="font-mono text-ink-500">{fmtDate(r.timestamp)}</span>
            <Badge tone={r.data?.outcome === 'failed' ? 'red' : r.action === 'Rollback' ? 'amber' : 'green'}>{r.action}</Badge>
            <span>{r.data?.target ?? r.description}</span>
            <span className="text-ink-500">{r.data?.changes?.map((c) => `${c.field}: ${c.before} → ${c.after}`).join(' · ')}</span>
            <span className="ml-auto text-ink-500">by {r.username}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function DoctorPage() {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<{ name: string; done: boolean }[]>([]);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [selected, setSelected] = useState<Finding | null>(null);
  const [pendingRecords, setPendingRecords] = useState<PendingRecord[]>([]);
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<Finding['severity'] | 'all'>('all');
  const stepsRef = useRef<HTMLDivElement>(null);
  // A verified fix waiting for the next diagnostics run to confirm the finding cleared.
  const pendingComparison = useRef<{ remediation: Remediation; finding: Finding } | null>(null);

  const diagnose = async () => {
    setRunning(true);
    setReport(null);
    setSteps([]);
    try {
      const r = await runDiagnostics((name, idx, total) => {
        setSteps((s) => {
          const next = s.map((x) => ({ ...x, done: true }));
          next.push({ name, done: idx >= total });
          return next.slice(-14);
        });
        stepsRef.current?.scrollTo(0, stepsRef.current.scrollHeight);
      });
      setReport(r);
      const pending = pendingComparison.current;
      if (pending &&
        !r.collectorErrors.some((error) => error.collector === pending.remediation.source) &&
        !r.findings.some((finding) => finding.ruleId === pending.finding.ruleId && finding.title === pending.finding.title)) {
        // Best effort: a failed snapshot must not hide the diagnosis result.
        saveDoctorSnapshot(pending.remediation.title, 'after', r.overall).catch(() => {});
        pendingComparison.current = null;
      }
      setSteps((s) => s.map((x) => ({ ...x, done: true })));
    } finally {
      setRunning(false);
    }
  };

  const onApplied = useCallback((remediation: Remediation, finding: Finding) => {
    if (report) {
      saveDoctorSnapshot(remediation.title, 'before', report.overall).catch(() => {});
      pendingComparison.current = { remediation, finding };
    }
    setPreviousScore(report?.overall ?? null);
  }, [report]);

  const onRecorded = useCallback((entry: AuditEntry) => {
    setPendingRecords((p) => [...p, { entry, at: Date.now() }]);
  }, []);

  const counts = report?.summary;
  const severityOrder: Finding['severity'][] = ['critical', 'warning', 'info', 'recommendation'];
  const query = search.trim().toLowerCase();
  const visibleFindings = (report?.findings ?? [])
    .filter((finding) => severityFilter === 'all' || finding.severity === severityFilter)
    .filter((finding) => !query || [finding.title, finding.description, finding.category, finding.recommendation ?? '', ...finding.evidence.map((item) => `${item.label} ${item.value}`)]
      .some((text) => text.toLowerCase().includes(query)))
    .sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));

  return (
    <div className="space-y-5">
      <PageHeader
        title="IRIS Doctor"
        description="One-click diagnosis — evaluates every subsystem against deterministic health rules and shows the evidence"
        actions={
          report && (
            <Button variant="outline" size="sm" onClick={() => exportReport(report)}>
              <Download className="h-3.5 w-3.5" /> Export report
            </Button>
          )
        }
      />

      {!report && !running && (
        <Card className="flex flex-col items-center gap-4 py-16">
          <Stethoscope className="h-12 w-12 text-accent-400" />
          <div className="text-center">
            <h2 className="text-base font-semibold">Diagnose this IRIS instance</h2>
            <p className="mt-1 max-w-md text-sm text-ink-400">
              Runs {14} checks across databases, processes, locks, journals, security, audit, web
              applications, certificates, tasks and licensing — then scores the environment and lists
              evidence-backed findings.
            </p>
          </div>
          <Button size="md" onClick={diagnose}>
            <Stethoscope className="h-4 w-4" /> Diagnose IRIS
          </Button>
        </Card>
      )}

      {(running || steps.length > 0) && !report && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-accent-400" /> Running diagnostics…
          </h3>
          <div ref={stepsRef} className="max-h-72 space-y-1 overflow-y-auto font-mono text-xs">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-ink-300">
                {s.done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <CircleDashed className="h-3.5 w-3.5 text-accent-400 animate-spin" />
                )}
                {s.name}
              </div>
            ))}
          </div>
        </Card>
      )}

      {report && (
        <>
          <Card className="p-5">
            <div className="flex items-center gap-6 flex-wrap">
              <div className="text-center">
                <div
                  className={cn(
                    'text-4xl font-bold',
                    report.overall >= 80 ? 'text-emerald-400' : report.overall >= 60 ? 'text-amber-400' : 'text-red-400',
                  )}
                >
                  {report.overall}
                  <span className="text-lg text-ink-500">/100</span>
                </div>
                <div className="mt-1 text-[11px] text-ink-400">IRIS Ops assessment</div>
              </div>
              <div className="flex gap-2">
                <Badge tone="red" className="px-3 py-1">{counts?.critical ?? 0} critical</Badge>
                <Badge tone="amber" className="px-3 py-1">{counts?.warning ?? 0} warnings</Badge>
                <Badge tone="blue" className="px-3 py-1">{counts?.info ?? 0} info</Badge>
                <Badge tone="purple" className="px-3 py-1">{counts?.recommendation ?? 0} recommendations</Badge>
              </div>
              <div className="ml-auto">
                <Button size="sm" variant="outline" loading={running} onClick={diagnose}>
                  Run again
                </Button>
              </div>
            </div>
          </Card>

          <p className="text-xs text-ink-500">{report.scoreMethod}{report.collectorErrors.length > 0 && ' Some data sources were unavailable, so this assessment is incomplete.'}</p>

          {previousScore !== null && (
            <p className="text-xs text-ink-400">Previous assessment: {previousScore}/100 · Current: {report.overall}/100. Compare the findings below to confirm the change. <Link to="/observability/timeline" className="text-accent-300 hover:underline">View before/after in Time Machine →</Link></p>
          )}

          {report.findings.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {(['all', ...severityOrder] as const).map((severity) => (
                  <button
                    key={severity}
                    type="button"
                    aria-pressed={severityFilter === severity}
                    onClick={() => setSeverityFilter(severity)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400',
                      severityFilter === severity ? 'border-accent-500 bg-accent-500/15 text-accent-300' : 'border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-200',
                    )}
                  >
                    {severity} ({severity === 'all' ? report.findings.length : counts?.[severity] ?? 0})
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative w-full max-w-sm">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-500" />
                  <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search findings or evidence…" aria-label="Search findings" />
                </label>
                <span className="text-xs text-ink-500">Showing {visibleFindings.length} of {report.findings.length} findings · highest severity first</span>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            {report.findings.length === 0 && (
              <Card className="p-8 text-center text-sm text-emerald-400">
                No findings — this instance is healthy.
              </Card>
            )}
            {report.findings.length > 0 && visibleFindings.length === 0 && (
              <Card className="p-8 text-center text-sm text-ink-400">No findings match this search and filter.</Card>
            )}
            {visibleFindings.map((f) => (
              <FindingCard key={f.id} finding={f} onEvidence={setSelected} />
            ))}
          </div>

          {report.collectorErrors.length > 0 && (
            <Card className="p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-400 mb-2">
                Collectors that could not run
              </h4>
              <ul className="space-y-1 text-xs text-ink-400 font-mono">
                {report.collectorErrors.map((e) => (
                  <li key={e.collector}>
                    <span className="text-amber-400">{e.collector}</span> — {e.error}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <RemediationHistory pending={pendingRecords} />
        </>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? ''}>
        {selected && (
          <FindingDetail
            finding={selected}
            onApplied={(remediation) => onApplied(remediation, selected)}
            onRecorded={onRecorded}
            onRerun={() => { setSelected(null); void diagnose(); }}
          />
        )}
      </Drawer>
    </div>
  );
}
