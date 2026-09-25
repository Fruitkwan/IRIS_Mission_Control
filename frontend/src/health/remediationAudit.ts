import { tokenStore } from '../auth/token';
import type { AuditEntry } from './remediation';

// Remediation audit records live in the IRIS audit log, written and read through
// the JWT-protected broker so each record carries the signed-in IRIS user.

export interface RemediationRecord {
  timestamp: string;
  username: string;
  action: string;
  description: string;
  data?: { ruleId?: string; target?: string; outcome?: string; changes?: AuditEntry['changes']; detail?: string };
}

const brokerFetch = async (path: string, init: RequestInit = {}) => {
  if (!tokenStore.brokerAccessToken) throw new Error('Broker session unavailable. Sign out and sign in again.');
  const response = await fetch(`/irisops-broker${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenStore.brokerAccessToken}` },
  });
  const body = (response.headers.get('content-type') ?? '').includes('application/json') ? await response.json() : {};
  if (!response.ok) throw new Error(body?.detail || `Broker returned HTTP ${response.status}`);
  return body;
};

/** Write one IRIS audit record for an apply or rollback. Never throws: the change itself already happened. */
export async function recordRemediation(entry: AuditEntry): Promise<{ recorded: boolean; detail?: string }> {
  try {
    const body = await brokerFetch('/api/remediation/audit', { method: 'POST', body: JSON.stringify(entry) });
    return { recorded: body?.recorded === true, detail: body?.detail };
  } catch (e) {
    return { recorded: false, detail: (e as Error).message };
  }
}

export async function remediationHistory(): Promise<RemediationRecord[]> {
  const body = await brokerFetch('/api/remediation/history');
  return Array.isArray(body?.records) ? body.records : [];
}
