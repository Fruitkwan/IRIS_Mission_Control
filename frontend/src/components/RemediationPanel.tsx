import { useState } from 'react';
import { ShieldCheck, Undo2, Wrench } from 'lucide-react';
import { axios } from '../api/axios-instance';
import type { Finding } from '../health/types';
import {
  applyRemediation, auditEntry, rollbackRemediation, RemediationError,
  type AuditEntry, type Plan, type Remediation, type RemediationApi,
} from '../health/remediation';
import { recordRemediation } from '../health/remediationAudit';
import { errText } from './toast';
import { Badge, Button } from './ui';

const api: RemediationApi = {
  get: (path, params) => axios.get(path, { params }).then((r) => r.data),
  put: (path, body, params) => axios.put(path, body, { params }).then((r) => r.data),
  post: (path, body, params) => axios.post(path, body ?? {}, { params }).then((r) => r.data),
};

type Audit = { recorded: boolean; detail?: string };
type Stage =
  | { kind: 'idle' }
  | { kind: 'preview'; plan: Plan }
  | { kind: 'applied'; before: Plan; after: Plan; audit: Audit; confirmUndo?: boolean }
  | { kind: 'rolledBack'; audit: Audit };

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
// No write happened for these failures, so there is nothing to audit.
const noWrite = (e: unknown) => e instanceof RemediationError && ['blocked', 'drift', 'unsupported'].includes(e.code);

function AuditNote({ audit, action }: { audit: Audit; action: 'Apply' | 'Rollback' }) {
  return audit.recorded
    ? <p className="text-ink-400">Recorded in the IRIS audit log as IrisOps/Remediation/{action}.</p>
    : <p className="text-amber-400">The change was made but not recorded in the IRIS audit log: {audit.detail}</p>;
}

export function RemediationPanel({ remediation: r, finding, onApplied, onRecorded, onRerun }: {
  remediation: Remediation;
  finding: Finding;
  onApplied?: (before: Plan, after: Plan) => void;
  /** Called with each audit record IRIS accepted. */
  onRecorded?: (entry: AuditEntry) => void;
  onRerun: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const record = async (entry: AuditEntry) => {
    const audit = await recordRemediation(entry);
    if (audit.recorded) onRecorded?.(entry);
    return audit;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await fn(); } finally { setBusy(false); }
  };

  const preview = () => run(async () => {
    try {
      setStage({ kind: 'preview', plan: await r.plan(api, finding) });
    } catch (e) {
      setError(`Could not read the current configuration: ${errText(e)}`);
    }
  });

  const apply = (previewed: Plan) => run(async () => {
    try {
      const { before, after } = await applyRemediation(api, r, finding, previewed);
      const audit = await record(auditEntry('Apply', r, before, 'verified'));
      setStage({ kind: 'applied', before, after, audit });
      onApplied?.(before, after);
    } catch (e) {
      if (e instanceof RemediationError && e.code === 'drift') setStage({ kind: 'idle' });
      if (!noWrite(e)) await recordRemediation(auditEntry('Apply', r, previewed, 'failed', errText(e)));
      setError(e instanceof RemediationError ? e.message : `The change could not be verified: ${errText(e)}`);
    }
  });

  const undo = (before: Plan, after: Plan) => run(async () => {
    try {
      await rollbackRemediation(api, r, finding, before, after);
      setStage({ kind: 'rolledBack', audit: await record(auditEntry('Rollback', r, before, 'verified')) });
    } catch (e) {
      if (!noWrite(e)) await recordRemediation(auditEntry('Rollback', r, before, 'failed', errText(e)));
      setError(e instanceof RemediationError ? e.message : `Rollback could not be verified: ${errText(e)}`);
    }
  });

  const guided = r.mode === 'guided';

  return (
    <div className="space-y-3 rounded-md border border-ink-700 p-3 text-xs">
      <div className="flex items-center gap-2">
        <Wrench className="h-4 w-4 text-accent-400" />
        <h3 className="text-sm font-semibold">{r.title}</h3>
        <Badge tone={guided ? 'blue' : 'purple'} className="ml-auto">{guided ? 'Guided fix' : 'Safe fix'}</Badge>
      </div>
      <dl className="space-y-1.5 text-ink-400">
        <div><dt className="inline font-medium text-ink-300">Scope: </dt><dd className="inline">{r.scope}</dd></div>
        <div><dt className="inline font-medium text-ink-300">Impact: </dt><dd className="inline">{r.impact}</dd></div>
        <div><dt className="inline font-medium text-ink-300">Rollback: </dt><dd className="inline">{r.rollback}</dd></div>
      </dl>

      {guided && (
        <ol className="list-decimal space-y-1 pl-4 text-ink-300">
          {r.steps?.map((step) => <li key={step}>{step}</li>)}
        </ol>
      )}

      {stage.kind === 'idle' && (
        <Button size="sm" variant="outline" loading={busy} onClick={preview}>{guided ? 'Verify' : 'Preview change'}</Button>
      )}

      {stage.kind === 'preview' && (() => {
        const { plan } = stage;
        return (
          <div className="space-y-2">
            <div className="text-ink-400">Target: <span className="font-mono text-ink-200">{plan.target}</span></div>
            {plan.context.length > 0 && (
              <div className="space-y-0.5 font-mono text-ink-400">
                {plan.context.map((c) => <div key={c.label}>{c.label}: {c.value}</div>)}
              </div>
            )}
            {plan.changes.length > 0 && (
              <div className="space-y-0.5 rounded border border-ink-700 bg-ink-900 p-2 font-mono text-ink-200">
                {plan.changes.map((c) => <div key={c.field}>{c.field}: {c.before} → {c.after}</div>)}
              </div>
            )}
            {plan.blocked && <p className="text-amber-400">{plan.blocked}</p>}
            {plan.resolved && <p role="status" className="text-emerald-400">{guided ? r.confirmed : 'Already resolved.'} Run diagnostics again to refresh this finding.</p>}
            <div className="flex flex-wrap gap-2">
              {!guided && !plan.blocked && !plan.resolved && (
                <Button size="sm" loading={busy} onClick={() => apply(plan)}>Confirm and {lowerFirst(r.title)}</Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={guided ? preview : () => setStage({ kind: 'idle' })}>{guided ? 'Verify again' : 'Cancel'}</Button>
              {plan.resolved && <Button size="sm" variant="outline" onClick={onRerun}>Run diagnostics and compare</Button>}
            </div>
          </div>
        );
      })()}

      {stage.kind === 'applied' && (
        <div className="space-y-2">
          <div className="space-y-0.5 rounded border border-emerald-500/30 bg-emerald-500/5 p-2 font-mono text-ink-200">
            {stage.before.changes.map((c) => <div key={c.field}>{c.field}: {c.before} → {c.after}</div>)}
          </div>
          <p role="status" className="flex items-start gap-1.5 text-emerald-400">
            <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>{r.confirmed} Run diagnostics again to verify the finding and assessment score.</span>
          </p>
          <AuditNote audit={stage.audit} action="Apply" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onRerun}>Run diagnostics and compare</Button>
            {!stage.confirmUndo && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setStage({ ...stage, confirmUndo: true })}>
                <Undo2 className="h-3.5 w-3.5" /> Undo change
              </Button>
            )}
            {stage.confirmUndo && (
              <Button size="sm" variant="danger" loading={busy} onClick={() => undo(stage.before, stage.after)}>Confirm rollback</Button>
            )}
          </div>
        </div>
      )}

      {stage.kind === 'rolledBack' && (
        <div className="space-y-2">
          <p role="status" className="text-ink-300">Rolled back. IRIS confirmed the previous configuration is restored.</p>
          <AuditNote audit={stage.audit} action="Rollback" />
          <Button size="sm" variant="outline" onClick={onRerun}>Run diagnostics</Button>
        </div>
      )}

      {error && <p role="alert" className="text-red-400">{error}</p>}
    </div>
  );
}
