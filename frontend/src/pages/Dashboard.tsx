import { useEffect, useRef, useState } from 'react';
// Only the chart parts in use, not all of echarts (about 1 MB less).
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);
import { useQuery } from '@tanstack/react-query';
import { axios } from '../api/axios-instance';
import { resultOf } from '../api/helpers';
import { Card, CardHeader, Badge, PageLoader, ErrorState } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { fmtNum, cn } from '../lib/utils';
import { useTheme } from '../lib/theme';
const useServerInfo = () =>
  useQuery({
    queryKey: ['server-info'],
    queryFn: () => axios.get('/info').then((r) => resultOf<Record<string, unknown>>(r.data)),
    staleTime: 60_000,
  });

type MainDash = {
  Performance?: {
    GlobalRefsPerSecond?: number;
    GlobalRefs?: number;
    GlobalSetKill?: number;
    RoutineRefs?: number;
    LogicalRequests?: number;
    DiskReads?: number;
    DiskWrites?: number;
    CacheEfficiency?: number;
  };
  ECP?: Record<string, string | number>;
  Status?: { UpTime?: string; LastBackup?: string; SystemMonitor?: boolean };
  SystemUsage?: Record<string, string | number | { Process?: number | string; Commands?: number }[]>;
};

function usePoll(path: string, interval = 3000) {
  return useQuery({
    queryKey: ['poll', path],
    queryFn: () => axios.get(path).then((r) => resultOf(r.data)),
    refetchInterval: interval,
  });
}

function StatCard({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: 'ok' | 'warn' }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{label}</div>
      <div className={cn('mt-1 text-2xl font-semibold tabular-nums', tone === 'warn' && 'text-amber-400')}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-500">{sub}</div>}
    </Card>
  );
}

function StatusBadge({ label, value }: { label: string; value: unknown }) {
  const v = String(value ?? '');
  const ok = v === 'Normal' || v === 'true' || v === 'Running';
  const bad = v === 'Critical' || v === 'Degraded' || v === 'false';
  return (
    <div className="flex items-center justify-between rounded-md border border-ink-800 bg-ink-850 px-3 py-2">
      <span className="text-xs text-ink-400">{label}</span>
      <Badge tone={ok ? 'green' : bad ? 'red' : 'amber'}>{v === '' ? '—' : v}</Badge>
    </div>
  );
}

const CHART_COLORS = {
  dark: { legend: '#94a3b8', split: '#1a2230', axis: '#64748b', tipBg: '#131a23', tipBorder: '#243040', tipText: '#e2e8f0' },
  light: { legend: '#475569', split: '#e2e8f0', axis: '#64748b', tipBg: '#ffffff', tipBorder: '#cbd5e1', tipText: '#0f172a' },
};

function LiveChart({ title, series }: { title: string; series: { name: string; data: number[]; color: string }[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);
  const theme = useTheme();
  const c = CHART_COLORS[theme];

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    const ro = new ResizeObserver(() => chartRef.current?.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chartRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption({
      grid: { left: 50, right: 12, top: 24, bottom: 20 },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: c.legend, fontSize: 10 },
        itemWidth: 10,
        itemHeight: 2,
      },
      xAxis: {
        type: 'category',
        data: series[0]?.data.map((_, i) => i) ?? [],
        show: false,
        boundaryGap: false,
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: c.split } },
        axisLabel: { color: c.axis, fontSize: 10 },
      },
      series: series.map((s) => ({
        name: s.name,
        type: 'line',
        data: s.data,
        showSymbol: false,
        smooth: true,
        lineStyle: { width: 1.5, color: s.color },
        areaStyle: { opacity: 0.08, color: s.color },
      })),
      animation: false,
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.tipBg,
        borderColor: c.tipBorder,
        textStyle: { color: c.tipText, fontSize: 11 },
      },
    });
  }, [series, c]);

  return (
    <Card>
      <CardHeader title={title} />
      <div ref={ref} className="h-44 w-full p-2" />
    </Card>
  );
}

const HISTORY_LEN = 60;

type History = { glo: number[]; rd: number[]; wr: number[]; rt: number[] };

/** Appends one sample per series, keeping the newest HISTORY_LEN points. */
const appendSample = (h: History, perf: NonNullable<MainDash['Performance']>): History => {
  const push = (list: number[], v?: number) => [...list, v ?? 0].slice(-HISTORY_LEN);
  return { glo: push(h.glo, perf.GlobalRefsPerSecond), rd: push(h.rd, perf.DiskReads), wr: push(h.wr, perf.DiskWrites), rt: push(h.rt, perf.RoutineRefs) };
};

export function Dashboard() {
  const main = usePoll('/v2/monitor/dashboard/main', 3000);
  const info = useServerInfo();
  const d = main.data as MainDash | undefined;
  // Chart history is state, extended once per new poll result while rendering
  // (React's pattern for deriving state from a changed value), so charts re-render with it.
  const [hist, setHist] = useState<{ source?: MainDash; series: History }>({ series: { glo: [], rd: [], wr: [], rt: [] } });
  if (d?.Performance && d !== hist.source) {
    setHist({ source: d, series: appendSample(hist.series, d.Performance) });
  }

  if (main.isLoading) return <PageLoader />;
  if (main.error) return <ErrorState error={main.error} retry={() => main.refetch()} />;

  const p = d?.Performance ?? {};
  const su = (d?.SystemUsage ?? {}) as Record<string, unknown>;
  const busy = (su.BusyProcesses as { Process?: number | string; Commands?: number }[] | undefined)?.filter(
    (b) => b.Process !== '' && b.Process != null,
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description={
          (info.data?.serverVersion as string | undefined) ?? 'System overview'
        }
        actions={
          <Badge tone={main.isFetching ? 'blue' : 'green'}>
            {main.isFetching ? 'updating…' : 'live'}
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <StatCard label="Uptime" value={d?.Status?.UpTime ?? '—'} />
        <StatCard label="Global refs/s" value={fmtNum(p.GlobalRefsPerSecond)} sub={`${fmtNum(p.GlobalRefs)} total`} />
        <StatCard label="Cache efficiency" value={p.CacheEfficiency != null ? `${p.CacheEfficiency}%` : '—'} />
        <StatCard label="Processes" value={fmtNum(su.Processes as number)} sub={`${fmtNum(su.CSPSessions as number)} CSP sessions`} />
        <StatCard label="Journal entries" value={fmtNum(su.JournalEntries as number)} />
        <StatCard label="Last backup" value={<span className="text-sm">{String(d?.Status?.LastBackup ?? '—')}</span>} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <LiveChart title="Global references / sec" series={[{ name: 'glo refs/s', data: [...hist.series.glo], color: '#2dd4bf' }]} />
        <LiveChart
          title="Disk I/O"
          series={[
            { name: 'reads', data: [...hist.series.rd], color: '#60a5fa' },
            { name: 'writes', data: [...hist.series.wr], color: '#f59e0b' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader title="Subsystem status" />
          <div className="grid grid-cols-2 gap-2 p-3">
            <StatusBadge label="Database space" value={su.DatabaseSpace} />
            <StatusBadge label="Journal space" value={su.JournalSpace} />
            <StatusBadge label="Journal (DB)" value={su.DatabaseJournal} />
            <StatusBadge label="Lock table" value={su.LockTable} />
            <StatusBadge label="Write daemon" value={su.WriteDaemon} />
            <StatusBadge label="System monitor" value={d?.Status?.SystemMonitor} />
            {Object.entries(d?.ECP ?? {}).map(([k, v]) => (
              <StatusBadge key={k} label={k} value={v} />
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Busiest processes" subtitle="by commands executed" />
          <div className="p-3">
            {busy?.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-ink-500">
                    <th className="pb-2">PID</th>
                    <th className="pb-2 text-right">Commands</th>
                  </tr>
                </thead>
                <tbody>
                  {busy.slice(0, 8).map((b, i) => (
                    <tr key={i} className="border-t border-ink-800">
                      <td className="py-1.5 font-mono text-xs text-ink-300">{b.Process}</td>
                      <td className="py-1.5 text-right font-mono text-xs">{fmtNum(b.Commands)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-6 text-center text-xs text-ink-500">No busy processes</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
