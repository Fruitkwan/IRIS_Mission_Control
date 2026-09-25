import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Download, Loader2, Search, Stethoscope } from 'lucide-react';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { errText } from '../../components/toast';
import { PageHeader } from '../../components/PageHeader';
import { Badge, Button, Card, Input } from '../../components/ui';
import { Drawer } from '../../components/DetailDrawer';
import { EvidenceView, FindingCard } from '../../components/FindingCard';
import { runDiagnostics } from '../../health/engine';
import type { Finding, HealthReport } from '../../health/types';
import { cn } from '../../lib/utils';
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

export function DoctorPage() {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<{ name: string; done: boolean }[]>([]);
  const [report, setReport] = useState<HealthReport | null>(null);
  const [selected, setSelected] = useState<Finding | null>(null);
  const [auditState, setAuditState] = useState<{ eventEnabled: boolean; masterEnabled: boolean } | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditError, setAuditError] = useState('');
  const [auditResult, setAuditResult] = useState('');
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<Finding['severity'] | 'all'>('all');
  const stepsRef = useRef<HTMLDivElement>(null);
  const pendingAuditComparison = useRef(false);

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
      if (pendingAuditComparison.current &&
        !r.collectorErrors.some((error) => error.collector === 'auditEvents') &&
        !r.findings.some((finding) => finding.ruleId === 'audit-login-off')) {
        saveDoctorSnapshot('After login audit fix', r.overall, true);
        pendingAuditComparison.current = false;
      }
      setSteps((s) => s.map((x) => ({ ...x, done: true })));
    } finally {
      setRunning(false);
    }
  };

  const auditParams = { source: '%System', type: '%Login', name: 'Login' };

  const inspectAudit = async () => {
    setAuditBusy(true);
    setAuditError('');
    setAuditState(null);
    try {
      const [event, master] = await Promise.all([
        axios.get('/v2/security/audit/event', { params: auditParams }),
        axios.get('/v2/security/audit/enabled'),
      ]);
      const currentEvent = resultOf<Record<string, unknown>>(event.data);
      const currentMaster = resultOf<Record<string, unknown>>(master.data);
      setAuditState({ eventEnabled: currentEvent?.Enabled === true, masterEnabled: currentMaster?.Enabled === true });
    } catch (e) {
      setAuditError(`Could not read current audit configuration: ${errText(e)}`);
    } finally {
      setAuditBusy(false);
    }
  };

  const enableLoginAudit = async () => {
    if (!auditState || auditState.eventEnabled || !auditState.masterEnabled) return;
    setAuditBusy(true);
    setAuditError('');
    setAuditResult('');
    try {
      // Recheck immediately before writing in case another administrator changed it.
      const before = resultOf<Record<string, unknown>>((await axios.get('/v2/security/audit/event', { params: auditParams })).data);
      if (before?.Enabled !== false) {
        setAuditError('The event changed since preview. Review the current state before applying.');
        setAuditState(null);
        return;
      }
      await axios.put('/v2/security/audit/event', { Enabled: true }, { params: auditParams });
      const verified = resultOf<Record<string, unknown>>((await axios.get('/v2/security/audit/event', { params: auditParams })).data);
      if (verified?.Enabled !== true) throw new Error('IRIS did not confirm that the login event is enabled.');
      if (report) {
        saveDoctorSnapshot('Before login audit fix', report.overall, false);
        pendingAuditComparison.current = true;
      }
      setPreviousScore(report?.overall ?? null);
      setAuditState({ ...auditState, eventEnabled: true });
      setAuditResult('IRIS confirmed login auditing is enabled. Run diagnostics again to verify the finding and assessment score.');
    } catch (e) {
      setAuditError(`Could not verify the change: ${errText(e)}`);
    } finally {
      setAuditBusy(false);
    }
  };

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
        </>
      )}

      <Drawer open={!!selected} onClose={() => { setSelected(null); setAuditState(null); setAuditError(''); setAuditResult(''); }} title={selected?.title ?? ''}>
        {selected && <div className="space-y-5">
          <EvidenceView finding={selected} />
          {selected.ruleId === 'audit-login-off' && (
            <div className="space-y-3 rounded-md border border-ink-700 p-3 text-xs">
              <h3 className="text-sm font-semibold">Resolve login auditing finding</h3>
              <p className="text-ink-400">Preview the live configuration before making this change. The action enables only the %System/%Login/Login event.</p>
              {!auditState && <Button size="sm" variant="outline" loading={auditBusy} onClick={inspectAudit}>Preview change</Button>}
              {auditState && (
                <>
                  <div className="space-y-1 font-mono text-ink-300">
                    <div>Audit master switch: {auditState.masterEnabled ? 'enabled' : 'disabled'}</div>
                    <div>Login event: {auditState.eventEnabled ? 'enabled' : 'disabled'} → enabled</div>
                  </div>
                  {!auditState.masterEnabled && <p className="text-amber-400">The master audit switch is disabled. Enable it on the Audit page before changing this event.</p>}
                  {auditState.eventEnabled && <p className="text-emerald-400">The event is already enabled. Run diagnostics again to refresh this finding.</p>}
                  {!auditState.eventEnabled && auditState.masterEnabled && <Button size="sm" loading={auditBusy} onClick={enableLoginAudit}>Confirm and enable login auditing</Button>}
                </>
              )}
              {auditError && <p role="alert" className="text-red-400">{auditError}</p>}
              {auditResult && (
                <div className="space-y-2">
                  <p role="status" className="text-emerald-400">{auditResult}</p>
                  <Button size="sm" variant="outline" onClick={() => { setSelected(null); void diagnose(); }}>Run diagnostics and compare</Button>
                </div>
              )}
            </div>
          )}
        </div>}
      </Drawer>
    </div>
  );
}
