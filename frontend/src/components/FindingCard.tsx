import { AlertTriangle, ChevronRight, Info, Lightbulb, XOctagon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Finding } from '../health/types';
import { cn, fmtDate } from '../lib/utils';
import { Badge } from './ui';

export const SEV_TONE = {
  critical: 'red',
  warning: 'amber',
  info: 'blue',
  recommendation: 'purple',
} as const;

const SEV_ICON = {
  critical: XOctagon,
  warning: AlertTriangle,
  info: Info,
  recommendation: Lightbulb,
};

export function FindingCard({ finding, onEvidence }: { finding: Finding; onEvidence?: (f: Finding) => void }) {
  const Icon = SEV_ICON[finding.severity];
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-900 p-3.5 hover:border-ink-600 transition-colors',
        finding.severity === 'critical' && 'border-red-500/30',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4.5 w-4.5 shrink-0',
          finding.severity === 'critical' && 'text-red-400',
          finding.severity === 'warning' && 'text-amber-400',
          finding.severity === 'info' && 'text-blue-400',
          finding.severity === 'recommendation' && 'text-purple-400',
        )}
        size={18}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-ink-100">{finding.title}</span>
          <Badge tone={SEV_TONE[finding.severity]}>{finding.severity}</Badge>
          <Badge tone="neutral">{finding.category}</Badge>
        </div>
        <p className="mt-1 text-xs text-ink-400 leading-relaxed">{finding.description}</p>
        {finding.recommendation && (
          <p className="mt-1.5 text-xs text-ink-300">
            <span className="text-ink-500">Recommendation: </span>
            {finding.recommendation}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3 text-[11px] text-ink-500">
          <button
            className="text-accent-400 hover:text-accent-300 inline-flex items-center gap-0.5"
            onClick={() => onEvidence?.(finding)}
          >
            View evidence <ChevronRight className="h-3 w-3" />
          </button>
          {finding.link && (
            <Link to={finding.link} className="text-accent-400 hover:text-accent-300">
              Investigate →
            </Link>
          )}
          <span>{fmtDate(finding.detectedAt)}</span>
        </div>
      </div>
    </div>
  );
}

export function EvidenceView({ finding }: { finding: Finding }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <Badge tone={SEV_TONE[finding.severity]}>{finding.severity}</Badge>
          <Badge tone="neutral">{finding.category}</Badge>
        </div>
        <p className="mt-2 text-sm text-ink-200">{finding.description}</p>
      </div>
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Evidence</h4>
        <div className="rounded-md border border-ink-700 divide-y divide-ink-800">
          {finding.evidence.map((e, i) => (
            <div key={i} className="flex justify-between gap-4 px-3 py-2 text-xs">
              <span className="text-ink-400">{e.label}</span>
              <span className="font-mono text-ink-100 text-right break-all">{e.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-ink-700 p-2.5">
          <div className="text-ink-500">Detected</div>
          <div className="mt-0.5 text-ink-200">{fmtDate(finding.detectedAt)}</div>
        </div>
        <div className="rounded-md border border-ink-700 p-2.5">
          <div className="text-ink-500">Source</div>
          <div className="mt-0.5 text-ink-200">{finding.source}</div>
        </div>
      </div>
      {finding.recommendation && (
        <div className="rounded-md border border-accent-500/30 bg-accent-500/5 p-3 text-xs text-ink-200">
          <span className="font-semibold text-accent-300">Recommendation: </span>
          {finding.recommendation}
        </div>
      )}
    </div>
  );
}
