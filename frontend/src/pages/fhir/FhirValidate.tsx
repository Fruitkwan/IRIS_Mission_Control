import { useState } from 'react';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Badge, Button, Card, CardHeader, Textarea } from '../../components/ui';
import { cn } from '../../lib/utils';

interface Check {
  path: string;
  ok: boolean | 'warn';
  message: string;
}

const KNOWN_TYPES = new Set([
  'Patient', 'Observation', 'Encounter', 'Condition', 'MedicationRequest', 'AllergyIntolerance',
  'Immunization', 'DiagnosticReport', 'Practitioner', 'Organization', 'Procedure', 'Bundle',
  'CapabilityStatement', 'OperationOutcome', 'CarePlan', 'Coverage', 'Claim',
]);

const REQUIRED: Record<string, string[]> = {
  Patient: ['name'],
  Observation: ['status', 'code'],
  Encounter: ['status'],
  Condition: ['subject'],
  MedicationRequest: ['status', 'intent', 'medicationCodeableConcept|medicationReference', 'subject'],
  AllergyIntolerance: ['patient'],
  Immunization: ['status', 'vaccineCode', 'patient'],
  DiagnosticReport: ['status', 'code'],
  Bundle: ['type'],
};

function validate(resource: Record<string, unknown>): Check[] {
  const checks: Check[] = [];
  const type = String(resource.resourceType ?? '');
  checks.push({
    path: 'resourceType',
    ok: !!type,
    message: type ? `resourceType = ${type}` : 'resourceType is missing',
  });
  if (type && !KNOWN_TYPES.has(type)) {
    checks.push({ path: 'resourceType', ok: 'warn', message: `"${type}" is not a recognized FHIR R4 resource type` });
  }
  for (const req of REQUIRED[type] ?? []) {
    const ok = req.split('|').some((f) => resource[f] !== undefined);
    checks.push({
      path: req,
      ok,
      message: ok ? `${req.split('|')[0]} present` : `required element ${req} is missing`,
    });
  }
  if (type === 'Patient') {
    if (resource.birthDate && !/^\d{4}(-\d{2})?(-\d{2})?$/.test(String(resource.birthDate))) {
      checks.push({ path: 'birthDate', ok: false, message: 'birthDate is not a valid FHIR date (YYYY[-MM[-DD]])' });
    }
    if (resource.gender && !['male', 'female', 'other', 'unknown'].includes(String(resource.gender))) {
      checks.push({ path: 'gender', ok: false, message: 'gender must be male | female | other | unknown' });
    }
    if (!resource.telecom) checks.push({ path: 'telecom', ok: 'warn', message: 'telecom absent — recommended for contact' });
    if (!resource.identifier) checks.push({ path: 'identifier', ok: 'warn', message: 'identifier absent — recommended for matching' });
  }
  if (type === 'Observation' && !resource.valueQuantity && !resource.valueCodeableConcept && !resource.component) {
    checks.push({ path: 'value[x]', ok: 'warn', message: 'Observation has no value — unusual' });
  }
  return checks;
}

const SAMPLE = JSON.stringify(
  {
    resourceType: 'Patient',
    identifier: [{ system: 'urn:irisops:demo', value: 'DEMO-9999' }],
    name: [{ use: 'official', family: 'Test', given: ['Synthetic'] }],
    gender: 'female',
    birthDate: '1999-01-01',
  },
  null,
  2,
);

export function FhirValidatePage() {
  const [text, setText] = useState(SAMPLE);
  const [result, setResult] = useState<{ checks: Check[]; error?: string; ms: number } | null>(null);

  const run = () => {
    const t0 = performance.now();
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
      setResult({ checks: validate(parsed), ms: Math.round(performance.now() - t0) });
    } catch {
      setResult({ checks: [], error: 'Input is not valid JSON', ms: Math.round(performance.now() - t0) });
    }
  };

  const errors = result?.checks.filter((c) => c.ok === false) ?? [];
  const warns = result?.checks.filter((c) => c.ok === 'warn') ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="FHIR Validation"
        description="Structural validation of a pasted FHIR resource (use synthetic data only)"
      />
      <Card className="p-4 space-y-3">
        <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        <div className="flex gap-2">
          <Button onClick={run}><ShieldCheck className="h-3.5 w-3.5" /> Validate</Button>
          <Button variant="ghost" size="sm" onClick={() => setText(SAMPLE)}>Load synthetic sample</Button>
        </div>
      </Card>

      {result && (
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Result
                {result.error ? (
                  <Badge tone="red">invalid JSON</Badge>
                ) : errors.length ? (
                  <Badge tone="red">{errors.length} error{errors.length > 1 ? 's' : ''}</Badge>
                ) : (
                  <Badge tone="green">valid</Badge>
                )}
                {warns.length > 0 && <Badge tone="amber">{warns.length} warning{warns.length > 1 ? 's' : ''}</Badge>}
                <span className="text-xs font-normal text-ink-400">{result.ms} ms</span>
              </span>
            }
          />
          <div className="divide-y divide-ink-800">
            {result.error && <p className="p-4 text-sm text-red-400">{result.error}</p>}
            {result.checks.map((c, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
                {c.ok === true && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                {c.ok === 'warn' && <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />}
                {c.ok === false && <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
                <span className="font-mono text-ink-400 w-48 shrink-0">{c.path}</span>
                <span className={cn(c.ok === false ? 'text-red-300' : c.ok === 'warn' ? 'text-amber-300' : 'text-ink-300')}>
                  {c.message}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
