import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { CommandPalette, type PaletteItem } from './components/CommandPalette';
import { useAuth } from './auth/AuthContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { ProcessesPage } from './pages/system/ProcessesPage';
import { DatabasesPage } from './pages/system/DatabasesPage';
import { NamespacesPage } from './pages/system/NamespacesPage';
import { DevicesPage, LocksPage, SessionsPage } from './pages/system/DevicesLocksSessions';
import { LicensePage } from './pages/system/LicensePage';
import { JournalPage } from './pages/system/JournalPage';
import { EcpPage, ExtLangPage, WqmPage } from './pages/system/MiscPages';
import { UsersPage, RolesPage, ResourcesPage, ServicesPage } from './pages/security/BasicSecurity';
import { PermissionMatrixPage } from './pages/security/PermissionMatrix';
import { AuditPage } from './pages/security/AuditPage';
import { LdapPage, SslPage, WebAuthPage, MftPage } from './pages/security/SecurityPages';
import { EncryptionPage } from './pages/security/EncryptionPage';
import { SqlPrivilegesPage } from './pages/security/SqlPrivileges';
import { PrivilegedRoutinesPage, DocDbsPage, FsAccessPage } from './pages/system/ExtraPages';
import { OperationsPage } from './pages/operations/OperationsPage';
import { DoctorPage } from './pages/operations/DoctorPage';
import { FindingsPage } from './pages/operations/FindingsPage';
import { WalletPage, X509Page, OAuth2Page } from './pages/secrets/SecretsPages';
import { TasksPage, UpcomingTasksPage, TaskHistoryPage } from './pages/tasks/TaskPages';
import { WebAppsPage } from './pages/WebAppsPage';
import { ApiExplorerPage } from './pages/ApiExplorerPage';
import { LogsPage } from './pages/LogsPage';
import { AsyncPage } from './pages/AsyncPage';
import { McpPage } from './pages/mcp/McpPage';
import { FhirServersPage, FhirCapabilityPage } from './pages/fhir/FhirPages';
import { FhirExplorerPage } from './pages/fhir/FhirExplorer';
import { FhirValidatePage } from './pages/fhir/FhirValidate';
import { CloudOverviewPage, CloudSecretsPage } from './pages/cloud/CloudPages';
import { TimeMachinePage, DriftPage } from './pages/observability/ObservabilityPages';

const PALETTE_ROUTES: PaletteItem[] = [
  { label: 'Dashboard', to: '/', hint: 'system overview' },
  { label: 'Operations Center', to: '/operations', hint: 'health & findings' },
  { label: 'IRIS Doctor — Diagnose IRIS', to: '/doctor', hint: 'signature feature' },
  { label: 'Findings', to: '/findings' },
  { label: 'Processes', to: '/processes', hint: 'cpu · jobs' },
  { label: 'Databases', to: '/databases' },
  { label: 'Namespaces', to: '/namespaces' },
  { label: 'Devices', to: '/devices' },
  { label: 'Locks', to: '/locks' },
  { label: 'Web Sessions', to: '/sessions' },
  { label: 'License', to: '/license' },
  { label: 'Journal', to: '/journal' },
  { label: 'ECP', to: '/ecp' },
  { label: 'External Language Servers', to: '/ext-lang' },
  { label: 'Work Queue Manager', to: '/wqm' },
  { label: 'Users', to: '/security/users', hint: 'security' },
  { label: 'Roles', to: '/security/roles' },
  { label: 'Resources', to: '/security/resources' },
  { label: 'Permission Matrix', to: '/security/matrix' },
  { label: 'Services', to: '/security/services' },
  { label: 'Audit Events', to: '/security/audit' },
  { label: 'LDAP', to: '/security/ldap' },
  { label: 'SSL / TLS', to: '/security/ssl' },
  { label: 'Encryption', to: '/security/encryption' },
  { label: 'Web Auth', to: '/security/web-auth' },
  { label: 'MFT Connections', to: '/security/mft' },
  { label: 'SQL Privileges', to: '/security/sql-privileges' },
  { label: 'Privileged Routines', to: '/security/privileged-routines' },
  { label: 'Document Databases', to: '/doc-dbs' },
  { label: 'File System Access', to: '/fs-access' },
  { label: 'Wallet', to: '/secrets/wallet', hint: 'secrets' },
  { label: 'X.509 Credentials', to: '/secrets/x509' },
  { label: 'OAuth 2.0', to: '/secrets/oauth2' },
  { label: 'Tasks', to: '/tasks' },
  { label: 'Upcoming Tasks', to: '/tasks/upcoming' },
  { label: 'Task History', to: '/tasks/history' },
  { label: 'Web Apps', to: '/web-apps' },
  { label: 'API Explorer', to: '/api-explorer', hint: 'try the REST API' },
  { label: 'Log Console', to: '/logs' },
  { label: 'MCP Server', to: '/mcp', hint: 'AI tools' },
  { label: 'FHIR Control Center', to: '/fhir', hint: 'healthcare' },
  { label: 'FHIR Explorer', to: '/fhir/explorer' },
  { label: 'FHIR Capability', to: '/fhir/capability' },
  { label: 'FHIR Validation', to: '/fhir/validate' },
  { label: 'Cloud Integrations', to: '/cloud', hint: 'azure · aws · gcp' },
  { label: 'Cloud Secrets', to: '/cloud/secrets' },
  { label: 'Time Machine', to: '/observability/timeline', hint: 'snapshots' },
  { label: 'Configuration Drift', to: '/operations/drift' },
  { label: 'Async Operations', to: '/async' },
];

function Guard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const loc = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: loc }} replace />;
  return <>{children}</>;
}

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const items = useMemo(() => PALETTE_ROUTES, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <Guard>
              <AppShell onOpenPalette={() => setPaletteOpen(true)} />
            </Guard>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="doctor" element={<DoctorPage />} />
          <Route path="findings" element={<FindingsPage />} />
          <Route path="processes" element={<ProcessesPage />} />
          <Route path="databases" element={<DatabasesPage />} />
          <Route path="namespaces" element={<NamespacesPage />} />
          <Route path="devices" element={<DevicesPage />} />
          <Route path="locks" element={<LocksPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="license" element={<LicensePage />} />
          <Route path="journal" element={<JournalPage />} />
          <Route path="ecp" element={<EcpPage />} />
          <Route path="ext-lang" element={<ExtLangPage />} />
          <Route path="wqm" element={<WqmPage />} />
          <Route path="doc-dbs" element={<DocDbsPage />} />
          <Route path="fs-access" element={<FsAccessPage />} />
          <Route path="security/users" element={<UsersPage />} />
          <Route path="security/roles" element={<RolesPage />} />
          <Route path="security/resources" element={<ResourcesPage />} />
          <Route path="security/matrix" element={<PermissionMatrixPage />} />
          <Route path="security/services" element={<ServicesPage />} />
          <Route path="security/audit" element={<AuditPage />} />
          <Route path="security/ldap" element={<LdapPage />} />
          <Route path="security/ssl" element={<SslPage />} />
          <Route path="security/encryption" element={<EncryptionPage />} />
          <Route path="security/sql-privileges" element={<SqlPrivilegesPage />} />
          <Route path="security/privileged-routines" element={<PrivilegedRoutinesPage />} />
          <Route path="security/web-auth" element={<WebAuthPage />} />
          <Route path="security/mft" element={<MftPage />} />
          <Route path="secrets/wallet" element={<WalletPage />} />
          <Route path="secrets/x509" element={<X509Page />} />
          <Route path="secrets/oauth2" element={<OAuth2Page />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tasks/upcoming" element={<UpcomingTasksPage />} />
          <Route path="tasks/history" element={<TaskHistoryPage />} />
          <Route path="web-apps" element={<WebAppsPage />} />
          <Route path="api-explorer" element={<ApiExplorerPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="async" element={<AsyncPage />} />
          <Route path="mcp" element={<McpPage />} />
          <Route path="fhir" element={<FhirServersPage />} />
          <Route path="fhir/explorer" element={<FhirExplorerPage />} />
          <Route path="fhir/capability" element={<FhirCapabilityPage />} />
          <Route path="fhir/validate" element={<FhirValidatePage />} />
          <Route path="cloud" element={<CloudOverviewPage />} />
          <Route path="cloud/secrets" element={<CloudSecretsPage />} />
          <Route path="observability/timeline" element={<TimeMachinePage />} />
          <Route path="operations/drift" element={<DriftPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={items} />
    </>
  );
}
