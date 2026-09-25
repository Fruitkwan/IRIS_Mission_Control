import { axios } from '../api/axios-instance';
import { resultOf } from '../api/helpers';
import { tokenStore } from '../auth/token';

export interface CloudConnection {
  id: string;
  provider: 'azure' | 'aws' | 'gcp' | 'iris';
  name: string;
  config: Record<string, string>; // never stores secret values — references only
  status?: 'connected' | 'warning' | 'disconnected' | 'not-configured';
  lastCheckedAt?: string;
  lastError?: string;
}

const LS = 'irisops-cloud-connections';

export function getConnections(): CloudConnection[] {
  let list: CloudConnection[] = [];
  try {
    list = JSON.parse(localStorage.getItem(LS) ?? '[]');
  } catch {
    list = [];
  }
  // The IRIS wallet is always present as the local provider
  if (!list.some((c) => c.provider === 'iris')) {
    list = [
      { id: 'iris-local', provider: 'iris', name: 'IRIS Wallet (local)', config: {} },
      ...list,
    ];
  }
  return list;
}

export function saveConnections(list: CloudConnection[]) {
  localStorage.setItem(LS, JSON.stringify(list.filter((c) => c.provider !== 'iris')));
}

export function upsertConnection(c: CloudConnection) {
  const list = getConnections().filter((x) => x.id !== c.id);
  list.push(c);
  saveConnections(list);
}

export function removeConnection(id: string) {
  saveConnections(getConnections().filter((c) => c.id !== id));
}

export interface SecretMeta {
  provider: string;
  name: string;
  collection?: string;
  status: string;
}

export interface TestResult {
  status: CloudConnection['status'];
  detail: string;
  secrets?: SecretMeta[];
}

/** Test a connection. Cloud credentials are resolved by the server-side broker. */
export async function testConnection(c: CloudConnection): Promise<TestResult> {
  if (c.provider === 'iris') {
    try {
      const cols = resultOf<Record<string, unknown>[]>(await axios.get('/v2/wallet/collections').then((r) => r.data)) ?? [];
      const secrets: SecretMeta[] = [];
      for (const col of cols) {
        const name = String(col.Name ?? col.Collection ?? '');
        try {
          const items = resultOf<Record<string, unknown>[]>(
            await axios.get('/v2/wallet/secrets', { params: { collection: name } }).then((r) => r.data),
          ) ?? [];
          for (const s of items) {
            secrets.push({ provider: 'IRIS Wallet', name: String(s.Name ?? s.Key ?? '?'), collection: name, status: 'stored' });
          }
        } catch { /* collection may be empty/inaccessible */ }
      }
      if (cols.length === 0) {
        return { status: 'not-configured', detail: 'Wallet is reachable but has no configured collections.' };
      }
      return { status: 'connected', detail: `${cols.length} collection(s), ${secrets.length} stored secret(s)`, secrets };
    } catch (e) {
      return { status: 'disconnected', detail: `Wallet API unreachable: ${e}` };
    }
  }

  // Only references and public metadata cross this boundary. Secret values
  // never enter the browser.
  const required: Record<string, string[]> = {
    azure: ['vaultUrl', 'tenantId', 'clientId', 'credentialRef'],
    aws: ['region', 'accessKeyRef', 'secretKeyRef'],
    gcp: ['projectId', 'credentialRef'],
  };
  const missing = (required[c.provider] ?? []).filter((k) => !c.config[k]);
  if (missing.length) {
    return { status: 'not-configured', detail: `Missing configuration: ${missing.join(', ')}` };
  }
  if (!tokenStore.brokerAccessToken) {
    return { status: 'disconnected', detail: 'Broker session unavailable. Sign out and sign in again, then retry.' };
  }
  try {
    const response = await fetch('/irisops-broker/api/cloud/test', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenStore.brokerAccessToken}`,
      },
      body: JSON.stringify({ provider: c.provider, config: c.config }),
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return {
        status: 'disconnected',
        detail: response.status === 401 || response.status === 403
          ? 'Broker session expired or access denied. Sign out and sign in again, then retry.'
          : `Broker returned HTTP ${response.status} with ${contentType || 'an empty content type'}. Check the broker dispatch class and server logs.`,
      };
    }
    const result = (await response.json()) as TestResult;
    if (!response.ok) {
      return { status: 'disconnected', detail: result.detail || `Broker returned HTTP ${response.status}` };
    }
    return result;
  } catch (e) {
    return {
      status: 'disconnected',
      detail: `Server-side broker unreachable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export const PROVIDER_LABEL: Record<string, string> = {
  azure: 'Azure Key Vault',
  aws: 'AWS Secrets Manager',
  gcp: 'GCP Secret Manager',
  iris: 'IRIS Wallet',
};

export const PROVIDER_FIELDS: Record<string, { key: string; label: string; hint?: string }[]> = {
  azure: [
    { key: 'vaultUrl', label: 'Vault URL', hint: 'https://<vault>.vault.azure.net' },
    { key: 'tenantId', label: 'Tenant ID' },
    { key: 'clientId', label: 'Client ID' },
    { key: 'credentialRef', label: 'IRIS wallet secret ref', hint: 'collection/name — the client secret stays server-side' },
  ],
  aws: [
    { key: 'region', label: 'Region', hint: 'us-east-1' },
    { key: 'accessKeyRef', label: 'Access key ref (wallet)' },
    { key: 'secretKeyRef', label: 'Secret key ref (wallet)' },
  ],
  gcp: [
    { key: 'projectId', label: 'Project ID' },
    { key: 'credentialRef', label: 'Service-account JSON ref (wallet)' },
  ],
};
