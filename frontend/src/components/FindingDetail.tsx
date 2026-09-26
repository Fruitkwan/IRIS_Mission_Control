import type { Finding } from '../health/types';
import { remediationFor, type AuditEntry, type Plan, type Remediation } from '../health/remediation';
import { EvidenceView } from './FindingCard';
import { RemediationPanel } from './RemediationPanel';

/** Drawer body for a finding: its evidence, plus the safe fix when the rule has one. */
export function FindingDetail({ finding, onRerun, onApplied, onRecorded }: {
  finding: Finding;
  /** Re-run diagnostics after a fix (the drawer is expected to close). */
  onRerun: () => void;
  onApplied?: (remediation: Remediation, before: Plan, after: Plan) => void;
  onRecorded?: (entry: AuditEntry) => void;
}) {
  const remediation = remediationFor(finding.ruleId);
  return (
    <div className="space-y-5">
      <EvidenceView finding={finding} />
      {remediation && (
        <RemediationPanel
          key={finding.id}
          remediation={remediation}
          finding={finding}
          onApplied={onApplied && ((before, after) => onApplied(remediation, before, after))}
          onRecorded={onRecorded}
          onRerun={onRerun}
        />
      )}
    </div>
  );
}
