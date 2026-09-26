import type { Telemetry } from './types';
// Explicit .ts extension: MCP and node:test load this file via type stripping.
import { DIAGNOSTIC_SOURCES } from './sources.ts';

// Transport-agnostic collection shared by the portal (axios) and MCP (fetch),
// so both assess identical telemetry and can be tested without a live IRIS.

export interface CollectorResult {
  telemetry: Telemetry;
  errors: { collector: string; error: string }[];
}

/** Unwrap the SysAdmin `{ result }` envelope; bare payloads pass through. */
export const unwrap = (d: unknown) => (d as { result?: unknown })?.result ?? d;

/** Human-readable reason for a failed collector (axios, fetch or plain errors). */
export function errorMessage(e: unknown): string {
  const err = e as { response?: { data?: { status?: { summary?: string } }; status?: number }; message?: string };
  return (
    err?.response?.data?.status?.summary ||
    (err?.response?.status ? `HTTP ${err.response.status}` : err?.message || 'request failed')
  );
}

/** Fetch all telemetry in parallel; individual failures degrade gracefully. */
export async function collectFrom(
  get: (path: string) => Promise<unknown>,
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<CollectorResult> {
  const telemetry: Telemetry = {};
  const errors: CollectorResult['errors'] = [];
  let done = 0;
  await Promise.all(
    DIAGNOSTIC_SOURCES.map(async ({ key, path }) => {
      try {
        (telemetry as Record<string, unknown>)[key] = unwrap(await get(path));
      } catch (e) {
        errors.push({ collector: key, error: errorMessage(e) });
      }
      done++;
      onProgress?.(done, DIAGNOSTIC_SOURCES.length, key);
    }),
  );
  return { telemetry, errors };
}
