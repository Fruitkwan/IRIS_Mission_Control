import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Search } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Select } from '../../components/ui';
import { filterEntries, parseLines, type LogSeverity } from '../../logs/parse';
import { listMessagesLogs, readMessagesLog } from '../../logs/messagesLog';
import { cn, fmtBytes } from '../../lib/utils';

const IDEA_URL = 'https://ideas.intersystems.com/ideas/DPI-I-966';
const LINE_COUNTS = [200, 500, 1000, 5000];
const SEVERITY_TONE = { info: 'neutral', warning: 'amber', severe: 'red', fatal: 'red' } as const;
const SEVERITY_FILTERS: { value: LogSeverity; label: string }[] = [
  { value: 'info', label: 'All' },
  { value: 'warning', label: 'Warnings and above' },
  { value: 'severe', label: 'Severe and fatal' },
];

/** messages.log and rotated messages.old_* files, which the classic portal cannot show. */
export function MessagesLogPage() {
  const files = useQuery({ queryKey: ['messages-logs'], queryFn: listMessagesLogs });
  const [chosen, setChosen] = useState<string | null>(null);
  const [lines, setLines] = useState(500);
  const [minSeverity, setMinSeverity] = useState<LogSeverity>('info');
  const [query, setQuery] = useState('');

  const name = chosen ?? files.data?.[0]?.name ?? '';
  const content = useQuery({
    queryKey: ['messages-log', name, lines],
    queryFn: () => readMessagesLog(name, lines),
    enabled: !!name,
  });

  // Newest first, like the classic portal's view of messages.log.
  const entries = useMemo(() => parseLines(content.data?.lines ?? []).reverse(), [content.data]);
  const visible = filterEntries(entries, minSeverity, query);
  const file = files.data?.find((f) => f.name === name);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Messages log"
        description="messages.log and every rotated messages.old_* file, without logging in to the server"
        actions={
          <Button size="sm" variant="outline" loading={files.isFetching || content.isFetching} onClick={() => { void files.refetch(); void content.refetch(); }}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      {files.error && <ErrorState error={files.error} retry={() => files.refetch()} />}

      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-[11px] text-ink-400">File</label>
          <Select value={name} onChange={(e) => setChosen(e.target.value)} className="w-80" aria-label="Log file">
            {files.data?.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}{f.current ? ' (current)' : ''} · {fmtBytes(f.size)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-ink-400">Last lines</label>
          <Select value={lines} onChange={(e) => setLines(Number(e.target.value))} className="w-28" aria-label="Number of lines">
            {LINE_COUNTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-ink-400">Severity</label>
          <Select value={minSeverity} onChange={(e) => setMinSeverity(e.target.value as LogSeverity)} className="w-48" aria-label="Minimum severity">
            {SEVERITY_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </div>
        <label className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-500" />
          <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search text or source…" aria-label="Search log" />
        </label>
      </Card>

      {content.error && <ErrorState error={content.error} retry={() => content.refetch()} />}

      {content.data && (
        <Card>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-ink-800 px-4 py-2 text-xs text-ink-400">
            <span className="font-mono text-ink-200">{content.data.name}</span>
            {file && <span>modified {file.modified.slice(0, 19)} (server time)</span>}
            <span>
              {content.data.truncated ? `last ${lines} of ${content.data.totalLines} lines` : `${content.data.totalLines} lines`}
              {' · '}showing {visible.length} of {entries.length} entries, newest first
            </span>
          </div>
          {visible.length === 0 ? (
            <EmptyState title="No entries match" hint="Change the severity filter or search text." />
          ) : (
            <ol className="max-h-[640px] divide-y divide-ink-800 overflow-auto font-mono text-xs">
              {visible.map((e, i) => (
                <li key={i} className={cn('flex gap-3 px-4 py-1.5', e.severity !== 'info' && 'bg-amber-500/5', (e.severity === 'severe' || e.severity === 'fatal') && 'bg-red-500/5')}>
                  <span className="w-44 shrink-0 text-ink-500">{e.time ?? ''}</span>
                  <span className="w-16 shrink-0"><Badge tone={SEVERITY_TONE[e.severity]}>{e.severity}</Badge></span>
                  <span className="w-44 shrink-0 truncate text-ink-400" title={e.source}>{e.source ?? ''}</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink-200">{e.text}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      <p className="text-xs text-ink-500">
        Implements InterSystems Community Idea{' '}
        <a href={IDEA_URL} target="_blank" rel="noreferrer" className="text-accent-300 hover:underline">DPI-I-966</a>:
        view older messages.log files from the portal. Read-only; requires the %Admin_Operate or %Admin_Manage privilege.
      </p>
    </div>
  );
}
