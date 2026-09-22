import { collectTelemetry } from './collectors';
import { evaluate, toReport } from './rules';
import type { HealthReport } from './types';

export const DIAGNOSTIC_STEPS = [
  'Collecting system info',
  'Reading monitor dashboard',
  'Checking databases',
  'Checking processes',
  'Checking locks',
  'Checking journal configuration',
  'Checking tasks',
  'Checking security services',
  'Checking user accounts',
  'Checking audit configuration',
  'Checking web applications',
  'Checking certificates',
  'Evaluating health rules',
] as const;

export async function runDiagnostics(
  onStep?: (step: string, index: number, total: number) => void,
): Promise<HealthReport> {
  let i = 0;
  const step = (name: string) => onStep?.(name, ++i, DIAGNOSTIC_STEPS.length);
  const { telemetry, errors } = await collectTelemetry((_d, _t, name) => step(`Collected ${name}`));
  step('Evaluating health rules');
  const findings = evaluate(telemetry);
  return toReport(findings, errors);
}
