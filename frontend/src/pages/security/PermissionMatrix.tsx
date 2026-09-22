import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { axios } from '../../api/axios-instance';
import { resultOf } from '../../api/helpers';
import { Badge, Card, Input, PageLoader, ErrorState } from '../../components/ui';
import { PageHeader } from '../../components/PageHeader';
import { cn } from '../../lib/utils';
import { useGetSecurityRoles } from '../../api/generated/security/security';

type Row = Record<string, unknown>;
type PermMap = Record<string, string>; // resource -> "RW"/"R"/"U"

const RES_PREFIXES = ['%DB_', '%Service_', '%Admin_', '%Development', '%DocDB', '%Native_', '%Ens', '%Health', '%SQL'];

export function PermissionMatrixPage() {
  const roles = useGetSecurityRoles();
  const roleNames = useMemo(
    () => (resultOf<Row[]>(roles.data) ?? []).map((r) => String(r.Name)).filter(Boolean),
    [roles.data],
  );
  const [resFilter, setResFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  // Fetch every role's detail once — ~40 parallel GETs, fine for a local instance.
  const details = useQuery({
    queryKey: ['role-details', roleNames],
    enabled: roleNames.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const out: Record<string, { perms: PermMap; granted: string[]; desc: string }> = {};
      await Promise.all(
        roleNames.map(async (name) => {
          try {
            const { data } = await axios.get('/v2/security/role', { params: { name } });
            const res = resultOf<Row>(data) ?? {};
            const perms: PermMap = {};
            for (const r of (res.Resources as Row[] | undefined) ?? []) {
              perms[String(r.Name)] = String(r.Permissions ?? '');
            }
            out[name] = {
              perms,
              granted: (res.GrantedRoles as string[] | undefined) ?? [],
              desc: String(res.Description ?? ''),
            };
          } catch {
            out[name] = { perms: {}, granted: [], desc: '' };
          }
        }),
      );
      return out;
    },
  });

  const { resources, shownRoles } = useMemo(() => {
    const det = details.data ?? {};
    const resSet = new Set<string>();
    for (const d of Object.values(det)) for (const k of Object.keys(d.perms)) resSet.add(k);
    const allRes = [...resSet].sort((a, b) => {
      const pa = RES_PREFIXES.findIndex((p) => a.startsWith(p));
      const pb = RES_PREFIXES.findIndex((p) => b.startsWith(p));
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb) || a.localeCompare(b);
    });
    const rf = resFilter.toLowerCase();
    const filteredRes = rf ? allRes.filter((r) => r.toLowerCase().includes(rf)) : allRes;
    const rolef = roleFilter.toLowerCase();
    const filteredRoles = roleNames
      .filter((n) => !rolef || n.toLowerCase().includes(rolef))
      .sort((a, b) => a.localeCompare(b));
    return { resources: filteredRes, shownRoles: filteredRoles };
  }, [details.data, roleNames, resFilter, roleFilter]);

  if (roles.isLoading || (roleNames.length > 0 && details.isLoading))
    return (
      <div>
        <PageHeader title="Permission Matrix" />
        <PageLoader />
      </div>
    );
  if (roles.error) return <ErrorState error={roles.error} retry={() => roles.refetch()} />;

  const det = details.data ?? {};

  return (
    <div className="space-y-4">
      <PageHeader
        title="Permission Matrix"
        description="Effective permissions: role × resource (U = use, R = read, W = write)"
        actions={
          <div className="flex gap-2">
            <Input
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              placeholder="Filter roles…"
              className="h-8 w-44 text-xs"
            />
            <Input
              value={resFilter}
              onChange={(e) => setResFilter(e.target.value)}
              placeholder="Filter resources…"
              className="h-8 w-44 text-xs"
            />
          </div>
        }
      />
      <Card className="overflow-auto">
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-ink-900">
            <tr>
              <th className="sticky left-0 z-20 min-w-56 border-b border-r border-ink-700 bg-ink-900 px-3 py-2 text-left font-medium text-ink-400">
                Resource
              </th>
              {shownRoles.map((r) => (
                <th
                  key={r}
                  className="border-b border-ink-700 px-1 py-2 align-bottom"
                  title={det[r]?.desc || r}
                >
                  <div className="mx-auto w-6 origin-center -rotate-45 whitespace-nowrap font-mono text-[10px] text-ink-300" style={{ transform: 'rotate(-55deg)', transformOrigin: 'left bottom', height: 90, width: 24, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.map((res) => (
              <tr key={res} className="hover:bg-ink-800/40">
                <td className="sticky left-0 border-b border-r border-ink-800 bg-ink-900 px-3 py-1 font-mono text-[11px] text-ink-300">
                  {res}
                </td>
                {shownRoles.map((role) => {
                  const p = det[role]?.perms[res];
                  return (
                    <td key={role} className="border-b border-ink-800/50 px-1 py-1 text-center">
                      {p ? (
                        <span
                          className={cn(
                            'inline-block rounded px-1 font-mono text-[10px] font-semibold',
                            p === 'RW'
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : p === 'R'
                                ? 'bg-blue-500/15 text-blue-400'
                                : 'bg-amber-500/15 text-amber-400',
                          )}
                        >
                          {p}
                        </span>
                      ) : (
                        <span className="text-ink-800">·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="flex gap-4 text-[11px] text-ink-500">
        <span><Badge tone="green">RW</Badge> read+write</span>
        <span><Badge tone="blue">R</Badge> read</span>
        <span><Badge tone="amber">U</Badge> use</span>
        <span>{shownRoles.length} roles · {resources.length} resources</span>
      </div>
    </div>
  );
}
