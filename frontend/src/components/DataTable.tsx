import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { EmptyState, Input, PageLoader, ErrorState } from './ui';

export type Column<T> = {
  key: string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
  searchable?: boolean;
};

function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}

export function DataTable<T extends object>({
  columns,
  rows,
  loading,
  error,
  onRetry,
  rowKey,
  onRowClick,
  searchPlaceholder = 'Filter…',
  empty,
  dense,
  toolbar,
  selectedKey,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  rowKey: (row: T, i: number) => string;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  empty?: React.ReactNode;
  dense?: boolean;
  toolbar?: React.ReactNode;
  selectedKey?: string | null;
}) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const filtered = useMemo(() => {
    if (!rows) return [];
    let out = rows;
    if (filter) {
      const f = filter.toLowerCase();
      const cols = columns.filter((c) => c.searchable !== false);
      out = out.filter((r) =>
        cols.some((c) => String(c.sortValue ? c.sortValue(r) : getPath(r, c.key) ?? '')
          .toLowerCase()
          .includes(f)),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const val = (r: T) => (col.sortValue ? col.sortValue(r) : (getPath(r, col.key) as string | number) ?? '');
        out = [...out].sort((a, b) => {
          const va = val(a);
          const vb = val(b);
          const cmp =
            typeof va === 'number' && typeof vb === 'number'
              ? va - vb
              : String(va).localeCompare(String(vb));
          return cmp * sort.dir;
        });
      }
    }
    return out;
  }, [rows, filter, sort, columns]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState error={error} retry={onRetry} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-ink-500" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <span className="text-xs text-ink-500">
          {filtered.length !== (rows?.length ?? 0) ? `${filtered.length} / ` : ''}
          {rows?.length ?? 0} rows
        </span>
        <div className="ml-auto flex items-center gap-2">{toolbar}</div>
      </div>
      <div className="overflow-auto rounded-lg border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-ink-700 bg-ink-850">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-3 font-medium text-ink-400 text-xs uppercase tracking-wide select-none',
                    dense ? 'py-1.5' : 'py-2.5',
                    c.className,
                  )}
                >
                  <button
                    className="inline-flex items-center gap-1 hover:text-ink-200"
                    onClick={() =>
                      setSort((s) =>
                        s?.key === c.key
                          ? s.dir === 1
                            ? { key: c.key, dir: -1 }
                            : null
                          : { key: c.key, dir: 1 },
                      )
                    }
                  >
                    {c.header}
                    {sort?.key === c.key &&
                      (sort.dir === 1 ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      ))}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => {
              const key = rowKey(row, i);
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-ink-800 last:border-0 transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-ink-800/60',
                    selectedKey === key && 'bg-accent-600/10',
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn('px-3 text-ink-200', dense ? 'py-1.5' : 'py-2.5', c.className)}
                    >
                      {c.render ? c.render(row) : (getPath(row, c.key) as React.ReactNode) ?? '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (empty ?? <EmptyState />)}
      </div>
    </div>
  );
}
