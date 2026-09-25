import { axios } from '../api/axios-instance';
import { collectFrom, type CollectorResult } from './collect';

export type { CollectorResult };

/** Fetch all telemetry in parallel; individual failures degrade gracefully. */
export function collectTelemetry(
  onProgress?: (done: number, total: number, name: string) => void,
): Promise<CollectorResult> {
  return collectFrom((path) => axios.get(path).then((x) => x.data), onProgress);
}
