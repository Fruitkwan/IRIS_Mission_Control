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
  Network,
  Plug,
  ScrollText,
  Search,
  Server,
  ShieldCheck,
  Shield,
  Stethoscope,
  TerminalSquare,
  UserCog,
  Users,
  Wallet,
  Workflow,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge, Button } from '../ui';
import { useAuth } from '../../auth/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { useEffect } from 'react';

const useServerInfo = () =>
  useQuery({
    queryKey: ['server-info'],
    queryFn: () => axios.get('/info').then((r) => resultOf<Record<string, unknown>>(r.data)),
    staleTime: 60_000,
  });

type NavItem = { to: string; label: string; icon: React.ElementType };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: '',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/operations', label: 'Operations', icon: Gauge },
      { to: '/doctor', label: 'IRIS Doctor', icon: Stethoscope },
      { to: '/findings', label: 'Findings', icon: AlertTriangle },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/processes', label: 'Processes', icon: Cpu },
      { to: '/databases', label: 'Databases', icon: Database },
      { to: '/namespaces', label: 'Namespaces', icon: Boxes },
      { to: '/devices', label: 'Devices', icon: MonitorSmartphone },
      { to: '/locks', label: 'Locks', icon: Lock },
      { to: '/sessions', label: 'Web Sessions', icon: Globe },
      { to: '/license', label: 'License', icon: KeyRound },
      { to: '/journal', label: 'Journal', icon: FileClock },
      { to: '/ecp', label: 'ECP', icon: Network },
      { to: '/ext-lang', label: 'Ext. Languages', icon: TerminalSquare },
      { to: '/wqm', label: 'Queue Manager', icon: Workflow },
      { to: '/doc-dbs', label: 'DocDBs', icon: Database },
      { to: '/fs-access', label: 'FS Access', icon: FolderLock },
    ],
  },
  {
    label: 'Security',
    items: [
      { to: '/security/users', label: 'Users', icon: Users },
      { to: '/security/roles', label: 'Roles', icon: UserCog },
      { to: '/security/resources', label: 'Resources', icon: FolderLock },
      { to: '/security/matrix', label: 'Permission Matrix', icon: Shield },
      { to: '/security/services', label: 'Services', icon: Plug },
      { to: '/security/audit', label: 'Audit', icon: ScrollText },
      { to: '/security/ldap', label: 'LDAP', icon: Server },
      { to: '/security/ssl', label: 'SSL / TLS', icon: ShieldCheck },
      { to: '/security/encryption', label: 'Encryption', icon: KeyRound },
      { to: '/security/web-auth', label: 'Web Auth', icon: Globe },
      { to: '/security/mft', label: 'MFT', icon: Network },
      { to: '/security/sql-privileges', label: 'SQL Privileges', icon: Shield },
      { to: '/security/privileged-routines', label: 'Priv. Routines', icon: TerminalSquare },
    ],
  },
  {
    label: 'Secrets',
    items: [
      { to: '/secrets/wallet', label: 'Wallet', icon: Wallet },
      { to: '/secrets/x509', label: 'X.509 Credentials', icon: KeyRound },
      { to: '/secrets/oauth2', label: 'OAuth 2.0', icon: ShieldCheck },
    ],
  },
  {
    label: 'Tasks',
    items: [
      { to: '/tasks', label: 'Tasks', icon: ListChecks },
      { to: '/tasks/upcoming', label: 'Upcoming', icon: CalendarClock },
      { to: '/tasks/history', label: 'History', icon: History },
    ],
  },
  {
    label: 'Healthcare',
    items: [
      { to: '/fhir', label: 'FHIR Servers', icon: HeartPulse },
      { to: '/fhir/explorer', label: 'FHIR Explorer', icon: Search },
      { to: '/fhir/capability', label: 'Capability', icon: Layers },
      { to: '/fhir/validate', label: 'Validation', icon: ShieldCheck },
    ],
  },
  {
    label: 'Observability',
    items: [
      { to: '/logs', label: 'Log Console', icon: ScrollText },
      { to: '/observability/timeline', label: 'Time Machine', icon: History },
      { to: '/operations/drift', label: 'Config Drift', icon: GitCompareArrows },
    ],
  },
  {
    label: 'Cloud',
    items: [
      { to: '/cloud', label: 'Overview', icon: Cloud },
      { to: '/cloud/secrets', label: 'Secrets Broker', icon: KeyRound },
    ],
  },
  {
    label: 'AI',
    items: [{ to: '/mcp', label: 'MCP Server', icon: Bot }],
  },
  {
    label: 'Applications',
    items: [
      { to: '/web-apps', label: 'Web Apps', icon: AppWindow },
      { to: '/api-explorer', label: 'API Explorer', icon: Layers },
    ],
  },
  {
    label: 'Diagnostics',
    items: [
      { to: '/logs', label: 'Log Console', icon: FileText },
      { to: '/async', label: 'Async Operations', icon: Activity },
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
                      <it.icon className="h-4 w-4 shrink-0 opacity-80" />
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
