import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Stethoscope } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Badge, Button, Card, CardHeader, PageLoader } from '../../components/ui';
import { FindingCard, EvidenceView } from '../../components/FindingCard';
import { Drawer } from '../../components/DetailDrawer';
import { useHealthReport } from '../../health/useHealth';
import type { Finding } from '../../health/types';
import { cn } from '../../lib/utils';

function ScoreRing({ score, label, size = 96 }: { score: number; label: string; size?: number }) {
  const color = score >= 80 ? '#34d399' : score >= 60 ? '#fbbf24' : '#f87171';
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2a2f3a" strokeWidth={7} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circ} ${circ}`}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill={color} fontSize={size / 4.2} fontWeight={700} transform={`rotate(90 ${size / 2} ${size / 2})`}>
          {score}
        </text>
      </svg>
      <span className="text-[11px] font-medium text-ink-400 capitalize">{label}</span>
    </div>
  );
}

const CAT_LABEL: Record<string, string> = {
  availability: 'Availability',
  database: 'Databases',
  performance: 'Performance',
  security: 'Security',
  certificate: 'Certificates',
  journal: 'Journal',
  tasks: 'Tasks',
  fhir: 'FHIR',
  cloud: 'Cloud',
};

export function OperationsPage() {
  const report = useHealthReport();
  const [selected, setSelected] = useState<Finding | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const r = report.data;

  if (report.isLoading) return <PageLoader />;

  const findings = (r?.findings ?? [])
    .filter((f) => filter === 'all' || f.severity === filter)
    .sort((a, b) => ['critical', 'warning', 'info', 'recommendation'].indexOf(a.severity) - ['critical', 'warning', 'info', 'recommendation'].indexOf(b.severity));

  const healthy = (r?.summary.critical ?? 0) === 0 && (r?.summary.warning ?? 0) === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Operations Center"
        description="Rule-based configuration assessment, evidence-backed findings, and recommendations"
        actions={
          <>
            <Link to="/doctor">
              <Button variant="outline" size="sm"><Stethoscope className="h-3.5 w-3.5" /> IRIS Doctor</Button>
            </Link>
            <Button size="sm" loading={report.isFetching} onClick={() => report.refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Re-evaluate
            </Button>
          </>
        }
      />

      {/* Score strip */}
      <Card className="p-5">
        <div className="flex items-center gap-8 flex-wrap">
          <ScoreRing score={r?.overall ?? 0} label="Assessment" size={110} />
          <div className="flex gap-6 flex-wrap">
            {(r?.scores ?? []).map((s) => (
              <ScoreRing key={s.category} score={s.score} label={CAT_LABEL[s.category] ?? s.category} size={72} />
            ))}
          </div>
          <div className="ml-auto text-right">
            <Badge tone={healthy ? 'green' : 'red'} className="text-xs px-3 py-1">
              {healthy ? '● Healthy' : '● Needs attention'}
            </Badge>
            <p className="mt-2 text-[11px] text-ink-500">
              Evaluated {new Date(r?.generatedAt ?? '').toLocaleTimeString()} · {r?.findings.length ?? 0} findings
            </p>
            {(r?.collectorErrors.length ?? 0) > 0 && (
              <p className="mt-1 text-[11px] text-amber-400">
                {r!.collectorErrors.length} collector{r!.collectorErrors.length > 1 ? 's' : ''} unavailable
              </p>
            )}
          </div>
        </div>
        <p className="mt-4 border-t border-ink-800 pt-3 text-[11px] text-ink-500">
          {r?.scoreMethod ?? 'Scores are calculated by IRIS Ops rules.'}
          {(r?.collectorErrors.length ?? 0) > 0 && ' Some data sources were unavailable, so this assessment is incomplete.'}
        </p>
      </Card>

      {/* Severity summary chips */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'critical', 'warning', 'info', 'recommendation'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === s ? 'border-accent-500 bg-accent-500/15 text-accent-300' : 'border-ink-700 text-ink-400 hover:border-ink-600',
            )}
          >
            {s === 'all' ? `All (${r?.findings.length ?? 0})` : `${s} (${r?.summary[s] ?? 0})`}
          </button>
        ))}
      </div>

      {/* Findings */}
      <Card>
        <CardHeader
          title="Findings"
          subtitle="Deterministic rules evaluated against live IRIS telemetry — every finding carries its evidence"
        />
        <div className="divide-y divide-ink-800 p-3 space-y-0">
          {findings.length === 0 && (
            <p className="p-6 text-center text-sm text-ink-400">
              {filter === 'all' ? 'No findings — environment looks healthy.' : `No ${filter} findings.`}
            </p>
          )}
          <div className="space-y-2.5">
            {findings.map((f) => (
              <FindingCard key={f.id} finding={f} onEvidence={setSelected} />
            ))}
          </div>
        </div>
      </Card>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? ''}>
        {selected && <EvidenceView finding={selected} />}
      </Drawer>
    </div>
  );
}
