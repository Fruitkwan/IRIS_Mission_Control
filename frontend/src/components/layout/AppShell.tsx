import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  AppWindow,
  Bot,
  Boxes,
  CalendarClock,
  Cloud,
  Cpu,
  Database,
  Download,
  Gauge,
  FileClock,
  FileText,
  FolderLock,
  GitCompareArrows,
  Globe,
  HeartPulse,
  History,
  KeyRound,
  Layers,
  LayoutDashboard,
  ListChecks,
  Lock,
  LogOut,
  MonitorSmartphone,
  Moon,
  Network,
  Plug,
  ScrollText,
  Search,
  Server,
  ShieldCheck,
  Shield,
  Stethoscope,
  Sun,
  TerminalSquare,
  UserCog,
  Users,
  Wallet,
  Workflow,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge, Button, PageLoader } from '../ui';
import { useAuth } from '../../auth/auth-context';
import { useQuery } from '@tanstack/react-query';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { toggleTheme, useTheme } from '../../lib/theme';
import { Suspense, useEffect } from 'react';

const useServerInfo = () =>
  useQuery({
    queryKey: ['server-info'],
    queryFn: () => axios.get('/info').then((r) => resultOf<Record<string, unknown>>(r.data)),
    staleTime: 60_000,
  });

type NavItem = { to: string; label: string; icon: React.ElementType; color: string };
type NavGroup = { label: string; items: NavItem[] };

// Icon hues chosen to read well on both dark and light themes.
const NAV: NavGroup[] = [
  {
    label: '',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, color: '#2dd4bf' },
      { to: '/operations', label: 'Operations', icon: Gauge, color: '#38bdf8' },
      { to: '/doctor', label: 'IRIS Doctor', icon: Stethoscope, color: '#f472b6' },
      { to: '/findings', label: 'Findings', icon: AlertTriangle, color: '#fbbf24' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/processes', label: 'Processes', icon: Cpu, color: '#60a5fa' },
      { to: '/databases', label: 'Databases', icon: Database, color: '#34d399' },
      { to: '/namespaces', label: 'Namespaces', icon: Boxes, color: '#a78bfa' },
      { to: '/devices', label: 'Devices', icon: MonitorSmartphone, color: '#94a3b8' },
      { to: '/locks', label: 'Locks', icon: Lock, color: '#f87171' },
      { to: '/sessions', label: 'Web Sessions', icon: Globe, color: '#22d3ee' },
      { to: '/license', label: 'License', icon: KeyRound, color: '#fbbf24' },
      { to: '/journal', label: 'Journal', icon: FileClock, color: '#fb923c' },
      { to: '/ecp', label: 'ECP', icon: Network, color: '#818cf8' },
      { to: '/ext-lang', label: 'Ext. Languages', icon: TerminalSquare, color: '#4ade80' },
      { to: '/wqm', label: 'Queue Manager', icon: Workflow, color: '#2dd4bf' },
      { to: '/doc-dbs', label: 'DocDBs', icon: Database, color: '#34d399' },
      { to: '/fs-access', label: 'FS Access', icon: FolderLock, color: '#fbbf24' },
    ],
  },
  {
    label: 'Security',
    items: [
      { to: '/security/users', label: 'Users', icon: Users, color: '#38bdf8' },
      { to: '/security/roles', label: 'Roles', icon: UserCog, color: '#818cf8' },
      { to: '/security/resources', label: 'Resources', icon: FolderLock, color: '#fbbf24' },
      { to: '/security/matrix', label: 'Permission Matrix', icon: Shield, color: '#34d399' },
      { to: '/security/services', label: 'Services', icon: Plug, color: '#a78bfa' },
      { to: '/security/audit', label: 'Audit', icon: ScrollText, color: '#fb923c' },
      { to: '/security/ldap', label: 'LDAP', icon: Server, color: '#94a3b8' },
      { to: '/security/ssl', label: 'SSL / TLS', icon: ShieldCheck, color: '#4ade80' },
      { to: '/security/encryption', label: 'Encryption', icon: KeyRound, color: '#f87171' },
      { to: '/security/web-auth', label: 'Web Auth', icon: Globe, color: '#22d3ee' },
      { to: '/security/mft', label: 'MFT', icon: Network, color: '#60a5fa' },
      { to: '/security/sql-privileges', label: 'SQL Privileges', icon: Shield, color: '#f472b6' },
      { to: '/security/privileged-routines', label: 'Priv. Routines', icon: TerminalSquare, color: '#fb923c' },
    ],
  },
  {
    label: 'Secrets',
    items: [
      { to: '/secrets/wallet', label: 'Wallet', icon: Wallet, color: '#fbbf24' },
      { to: '/secrets/x509', label: 'X.509 Credentials', icon: KeyRound, color: '#4ade80' },
      { to: '/secrets/oauth2', label: 'OAuth 2.0', icon: ShieldCheck, color: '#818cf8' },
    ],
  },
  {
    label: 'Tasks',
    items: [
      { to: '/tasks', label: 'Tasks', icon: ListChecks, color: '#a78bfa' },
      { to: '/tasks/upcoming', label: 'Upcoming', icon: CalendarClock, color: '#38bdf8' },
      { to: '/tasks/history', label: 'History', icon: History, color: '#94a3b8' },
    ],
  },
  {
    label: 'Healthcare',
    items: [
      { to: '/fhir', label: 'FHIR Servers', icon: HeartPulse, color: '#fb7185' },
      { to: '/fhir/explorer', label: 'FHIR Explorer', icon: Search, color: '#f472b6' },
      { to: '/fhir/capability', label: 'Capability', icon: Layers, color: '#e879f9' },
      { to: '/fhir/validate', label: 'Validation', icon: ShieldCheck, color: '#4ade80' },
    ],
  },
  {
    label: 'Observability',
    items: [
      { to: '/logs', label: 'Log Console', icon: ScrollText, color: '#fb923c' },
      { to: '/observability/timeline', label: 'Time Machine', icon: History, color: '#22d3ee' },
      { to: '/operations/drift', label: 'Config Drift', icon: GitCompareArrows, color: '#fbbf24' },
    ],
  },
  {
    label: 'Cloud',
    items: [
      { to: '/cloud', label: 'Overview', icon: Cloud, color: '#38bdf8' },
      { to: '/cloud/secrets', label: 'Secrets Broker', icon: KeyRound, color: '#fbbf24' },
    ],
  },
  {
    label: 'AI',
    items: [{ to: '/mcp', label: 'MCP Server', icon: Bot, color: '#a78bfa' }],
  },
  {
    label: 'Applications',
    items: [
      { to: '/web-apps', label: 'Web Apps', icon: AppWindow, color: '#22d3ee' },
      { to: '/api-explorer', label: 'API Explorer', icon: Layers, color: '#2dd4bf' },
    ],
  },
  {
    label: 'Diagnostics',
    items: [
      { to: '/logs', label: 'Log Console', icon: FileText, color: '#fb923c' },
      { to: '/async', label: 'Async Operations', icon: Activity, color: '#f87171' },
    ],
  },
];

async function exportConfig() {
  const sections: Record<string, string> = {
    users: '/v2/security/users',
    roles: '/v2/security/roles',
    resources: '/v2/security/resources',
    services: '/v2/security/services',
    webApps: '/v2/web-apps',
    namespaces: '/v2/namespaces',
    databases: '/v2/databases',
    tasks: '/v2/tasks',
    sslConfigurations: '/v2/security/ssl-configurations',
    ldapConfigurations: '/v2/security/ldap/configurations',
    x509Credentials: '/v2/security/x509-credentials',
    licenseServers: '/v2/license/servers',
    journalSettings: '/v2/journal/settings',
    webAuth: '/v2/security/web-auth',
    encryptionSettings: '/v2/security/encryption/settings',
    ecpSettings: '/v2/ecp/settings',
    devices: '/v2/devices',
  };
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), source: 'IrisOps' };
  await Promise.all(
    Object.entries(sections).map(async ([key, path]) => {
      try {
        const { data } = await axios.get(path);
        out[key] = data?.result ?? data;
      } catch (e) {
        out[key] = { error: String((e as { response?: { status?: number } }).response?.status ?? 'failed') };
      }
    }),
  );
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `iris-config-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function AppShell({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const info = useServerInfo();
  const theme = useTheme();

  // redirect to login when unauthenticated
  useEffect(() => {
    if (info.error && (info.error as { response?: { status?: number } }).response?.status === 401) {
      navigate('/login');
    }
  }, [info.error, navigate]);

  const version = info.data?.serverVersion as string | undefined;
  const shortVersion = version?.match(/\d{4}\.\d+/)?.[0];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-ink-800 bg-ink-900">
        <div className="flex h-14 items-center gap-2.5 border-b border-ink-800 px-4">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 font-bold text-sm">
            IO
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">IRIS Mission Control</div>
            <div className="text-[10px] text-ink-500">Management Portal</div>
          </div>
        </div>
        <button
          onClick={onOpenPalette}
          className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs text-ink-500 hover:border-ink-600 hover:text-ink-300"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Jump to…</span>
          <kbd className="rounded border border-ink-700 px-1 text-[10px]">⌃K</kbd>
        </button>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {NAV.map((g) => (
            <div key={g.label || 'top'} className="mb-4">
              {g.label && (
                <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                  {g.label}
                </div>
              )}
              <ul className="space-y-0.5">
                {g.items.map((it) => (
                  <li key={it.to}>
                    <NavLink
                      to={it.to}
                      end={it.to === '/'}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors',
                          isActive
                            ? 'bg-accent-600/15 text-accent-300 font-medium'
                            : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
                        )
                      }
                    >
                      <it.icon className="h-4 w-4 shrink-0" style={{ color: it.color }} />
                      {it.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-ink-800 px-4 py-3 text-[10px] text-ink-500">
          IRIS {shortVersion ?? '…'} · api v2
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-ink-800 bg-ink-900 px-5">
          <div className="flex items-center gap-2 text-sm text-ink-400">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                info.data ? 'bg-emerald-400' : 'bg-ink-600 animate-pulse',
              )}
            />
            {info.data
              ? `${(info.data.username as string) ?? user}@${(info.data.product as string) ?? 'iris'}`
              : 'connecting…'}
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-label="Toggle theme"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" title="Export instance config as JSON" onClick={exportConfig}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Badge tone="teal">{user}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-5">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
