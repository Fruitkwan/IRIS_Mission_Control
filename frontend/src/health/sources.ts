import type { Telemetry } from './types';

/** The portal and MCP must assess the same IRIS telemetry sources. */
export const DIAGNOSTIC_SOURCES: { key: keyof Telemetry; path: string }[] = [
  { key: 'info', path: '/info' },
  { key: 'dashboard', path: '/v2/monitor/dashboard/main' },
  { key: 'databases', path: '/v2/databases' },
  { key: 'processes', path: '/v2/processes' },
  { key: 'locks', path: '/v2/locks' },
  { key: 'tasks', path: '/v2/tasks' },
  { key: 'taskHistory', path: '/v2/task/history' },
  { key: 'users', path: '/v2/security/users' },
  { key: 'roles', path: '/v2/security/roles' },
  { key: 'services', path: '/v2/security/services' },
  { key: 'auditEvents', path: '/v2/security/audit/events' },
  { key: 'webApps', path: '/v2/web-apps' },
  { key: 'journalSettings', path: '/v2/journal/settings' },
  { key: 'licenseUsage', path: '/v2/license/usage' },
  { key: 'x509', path: '/v2/security/x509-credentials' },
  { key: 'sslConfigs', path: '/v2/security/ssl-configurations' },
  { key: 'namespaces', path: '/v2/namespaces' },
  { key: 'devices', path: '/v2/devices' },
  { key: 'asyncOps', path: '/v2/async-results' },
];
