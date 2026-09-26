import { brokerFetch } from '../api/broker';
import type { AuditEntry } from './remediation';

// Remediation audit records live in the IRIS audit log, written and read through
// the authenticated broker so each record carries the signed-in IRIS user.

export interface RemediationRecord {
  timestamp: string;
  username: string;
  action: string;
  description: string;
  data?: { ruleId?: string; target?: string; outcome?: string; changes?: AuditEntry['changes']; detail?: string };
}

/** Write one IRIS audit record for an apply or rollback. Never throws: the change itself already happened. */
export async function recordRemediation(entry: AuditEntry): Promise<{ recorded: boolean; detail?: string }> {
  try {
    const body = await brokerFetch<{ recorded?: boolean; detail?: string }>('/api/remediation/audit', { method: 'POST', body: JSON.stringify(entry) });
    return { recorded: body?.recorded === true, detail: body?.detail };
  } catch (e) {
    return { recorded: false, detail: (e as Error).message };
  }
}

export async function remediationHistory(): Promise<RemediationRecord[]> {
  const body = await brokerFetch<{ records?: RemediationRecord[] }>('/api/remediation/history');
  return Array.isArray(body?.records) ? body.records : [];
}
