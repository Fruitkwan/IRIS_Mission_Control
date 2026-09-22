// Synthetic FHIR R4 demo data — no real patient data, clearly demo-only.
export const DEMO_BASE = 'demo://fhir/r4';

export const DEMO_CAPABILITY = {
  resourceType: 'CapabilityStatement',
  status: 'active',
  kind: 'instance',
  fhirVersion: '4.0.1',
  format: ['json'],
  implementation: { description: 'IrisOps demo FHIR R4 endpoint (synthetic)' },
  rest: [
    {
      mode: 'server',
      resource: [
        { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }, { code: 'update' }], searchParam: [{ name: 'name' }, { name: 'birthdate' }, { name: 'identifier' }, { name: 'gender' }] },
        { type: 'Observation', interaction: [{ code: 'read' }, { code: 'search-type' }, { code: 'create' }], searchParam: [{ name: 'patient' }, { name: 'code' }, { name: 'date' }, { name: 'category' }] },
        { type: 'Encounter', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [{ name: 'patient' }, { name: 'date' }, { name: 'status' }] },
        { type: 'Condition', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [{ name: 'patient' }, { name: 'code' }] },
        { type: 'MedicationRequest', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [{ name: 'patient' }] },
        { type: 'AllergyIntolerance', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [{ name: 'patient' }] },
        { type: 'Immunization', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [{ name: 'patient' }] },
        { type: 'DiagnosticReport', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [{ name: 'patient' }, { name: 'code' }] },
        { type: 'Practitioner', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [{ name: 'name' }] },
        { type: 'Organization', interaction: [{ code: 'read' }, { code: 'search-type' }], searchParam: [{ name: 'name' }] },
      ],
    },
  ],
};

const names = [
  ['Sarah', 'Mitchell', '1978-03-14', 'female'],
  ['James', 'Okafor', '1952-11-02', 'male'],
  ['Emma', 'Lindqvist', '1990-07-22', 'female'],
  ['Liam', 'Nguyen', '2015-01-30', 'male'],
  ['Olivia', 'Kowalski', '1967-09-08', 'female'],
  ['Noah', 'Garcia', '1985-05-19', 'male'],
  ['Ava', 'Tanaka', '2001-12-01', 'female'],
  ['Ethan', 'Novak', '1943-04-27', 'male'],
] as const;

export const DEMO_PATIENTS = names.map(([g, f, bd, sex], i) => ({
  resourceType: 'Patient',
  id: `demo-${i + 1}`,
  identifier: [{ system: 'urn:irisops:demo', value: `DEMO-${1000 + i}` }],
  name: [{ use: 'official', family: f, given: [g] }],
  gender: sex,
  birthDate: bd,
  telecom: [{ system: 'phone', value: `+1-555-01${i}0` }],
  address: [{ city: ['Boston', 'Cambridge', 'Austin', 'Denver'][i % 4], country: 'US' }],
}));

const loinc = [
  ['8867-4', 'Heart rate', 'beats/min', 68, 96],
  ['8480-6', 'Systolic blood pressure', 'mmHg', 112, 145],
  ['8462-4', 'Diastolic blood pressure', 'mmHg', 70, 92],
  ['2339-0', 'Glucose', 'mg/dL', 82, 140],
] as const;

export const DEMO_OBSERVATIONS = DEMO_PATIENTS.flatMap((p, pi) =>
  loinc.map(([code, display, unit, lo, hi], oi) => ({
    resourceType: 'Observation',
    id: `obs-${pi}-${oi}`,
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code, display }] },
    subject: { reference: `Patient/${p.id}` },
    effectiveDateTime: `2026-09-${String(10 + ((pi + oi) % 9)).padStart(2, '0')}T${String(8 + oi * 3).padStart(2, '0')}:15:00Z`,
    valueQuantity: { value: Math.round(lo + ((pi * 7 + oi * 13) % (hi - lo))), unit },
  })),
);

export const DEMO_ENCOUNTERS = DEMO_PATIENTS.slice(0, 5).map((p, i) => ({
  resourceType: 'Encounter',
  id: `enc-${i + 1}`,
  status: 'finished',
  class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: i % 2 ? 'AMB' : 'IMP' },
  subject: { reference: `Patient/${p.id}` },
  period: { start: `2026-08-${String(3 + i * 4).padStart(2, '0')}`, end: `2026-08-${String(3 + i * 4).padStart(2, '0')}` },
  type: [{ text: ['Annual physical', 'Emergency visit', 'Follow-up', 'Consultation', 'Lab review'][i] }],
}));

const STORE: Record<string, Record<string, unknown>[]> = {
  Patient: DEMO_PATIENTS as Record<string, unknown>[],
  Observation: DEMO_OBSERVATIONS as Record<string, unknown>[],
  Encounter: DEMO_ENCOUNTERS as Record<string, unknown>[],
};

/** Tiny client-side FHIR search over the synthetic dataset. */
export function demoSearch(resourceType: string, params: Record<string, string>) {
  let items = STORE[resourceType] ?? [];
  if (params.name && resourceType === 'Patient') {
    const q = params.name.toLowerCase();
    items = items.filter((p) =>
      JSON.stringify(p.name).toLowerCase().includes(q),
    );
  }
  if (params.identifier && resourceType === 'Patient') {
    items = items.filter((p) => JSON.stringify(p.identifier).includes(params.identifier));
  }
  if (params.birthdate && resourceType === 'Patient') {
    items = items.filter((p) => String(p.birthDate).startsWith(params.birthdate));
  }
  if (params.patient) {
    items = items.filter((r) => JSON.stringify(r.subject ?? {}).includes(params.patient!));
  }
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total: items.length,
    link: [{ relation: 'self', url: `${DEMO_BASE}/${resourceType}` }],
    entry: items.map((resource) => ({ resource, search: { mode: 'match' } })),
  };
}
