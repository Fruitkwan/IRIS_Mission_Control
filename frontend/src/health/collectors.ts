import { axios } from '../api/axios-instance';
import type { Telemetry } from './types';
import { DIAGNOSTIC_SOURCES } from './sources';

const result = (d: unknown) =>
  (d as { result?: unknown })?.result ?? d;

async function safe<T>(fn: () => Promise<T>): Promise<{ data?: T; error?: string }> {
  try {
    return { data: await fn() };
  } catch (e) {
    const err = e as { response?: { data?: { status?: { summary?: string } }; status?: number }; message?: string };
    return {
      error:
        err?.response?.data?.status?.summary ||
        (err?.response?.status ? `HTTP ${err.response.status}` : err?.message || 'request failed'),
    };
  }
}

export interface CollectorResult {
  telemetry: Telemetry;
  errors: { collector: string; error: string }[];
}

/** Fetch all telemetry in parallel; individual failures degrade gracefully. */
export async function collectTelemetry(
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<CollectorResult> {
  const telemetry: Telemetry = {};
  const errors: CollectorResult['errors'] = [];
  let done = 0;
  await Promise.all(
    DIAGNOSTIC_SOURCES.map(async ({ key, path }) => {
      const r = await safe(() => axios.get(path).then((x) => result(x.data)));
      if (r.error) errors.push({ collector: key, error: r.error });
      else (telemetry as Record<string, unknown>)[key] = r.data;
      done++;
      onProgress?.(done, DIAGNOSTIC_SOURCES.length, key);
    }),
  );
  return { telemetry, errors };
}
