export type Severity = 'critical' | 'warning' | 'info' | 'recommendation';

export type Category =
  | 'availability'
  | 'database'
  | 'performance'
  | 'security'
  | 'certificate'
  | 'fhir'
  | 'cloud'
  | 'tasks'
  | 'journal';

export interface Evidence {
  label: string;
  value: string;
}

export interface Finding {
  id: string;
  ruleId: string;
  category: Category;
  severity: Severity;
  title: string;
  description: string;
  evidence: Evidence[];
  recommendation?: string;
  link?: string;
  source: string;
  detectedAt: string;
}

export interface CategoryScore {
  category: Category;
  score: number;
  findings: Finding[];
}

export interface HealthReport {
  generatedAt: string;
  scoreMethod: string;
  scores: CategoryScore[];
  overall: number;
  findings: Finding[];
  collectorErrors: { collector: string; error: string }[];
  summary: {
    critical: number;
    warning: number;
    info: number;
    recommendation: number;
  };
}

type Row = Record<string, unknown>;

/** Normalized telemetry gathered from the SysAdmin APIs. */
export interface Telemetry {
  info?: Row;
  dashboard?: Row;
  databases?: Row[];
  processes?: Row[];
  locks?: Row[];
  tasks?: Row[];
  taskHistory?: Row[];
  users?: Row[];
  roles?: Row[];
  services?: Row[];
  auditEvents?: Row[];
  webApps?: Row[];
  journalSettings?: Row;
  licenseUsage?: Row;
  x509?: Row[];
  sslConfigs?: Row[];
  namespaces?: Row[];
  devices?: Row[];
  asyncOps?: Row[];
}
