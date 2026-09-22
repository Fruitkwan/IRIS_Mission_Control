import { X } from 'lucide-react';
import { cn, fmtDate } from '../lib/utils';
import { Badge, Button } from './ui';

export function Drawer({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          'relative h-full overflow-y-auto border-l border-ink-700 bg-ink-900 shadow-2xl animate-fade-in',
          wide ? 'w-[720px]' : 'w-[480px]',
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-700 bg-ink-900 px-4 py-3">
          <h2 className="text-sm font-semibold truncate pr-4">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function renderVal(v: unknown): React.ReactNode {
  if (v == null || v === '') return <span className="text-ink-600">—</span>;
  if (typeof v === 'boolean')
    return <Badge tone={v ? 'green' : 'neutral'}>{v ? 'true' : 'false'}</Badge>;
  if (Array.isArray(v))
    return v.length === 0 ? (
      <span className="text-ink-600">[]</span>
    ) : (
      <span className="font-mono text-xs">{v.join(', ')}</span>
    );
  if (typeof v === 'object')
    return (
      <pre className="font-mono text-xs text-ink-300 whitespace-pre-wrap break-all">
        {JSON.stringify(v, null, 2)}
      </pre>
    );
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:/.test(s)) return fmtDate(s);
  return <span className="break-all">{s}</span>;
}

export function KeyValueGrid({ data }: { data: Record<string, unknown> | undefined | null }) {
  if (!data) return null;
  return (
    <dl className="divide-y divide-ink-800 rounded-lg border border-ink-800">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="grid grid-cols-[160px_1fr] gap-3 px-3 py-2">
          <dt className="text-xs font-medium text-ink-400 pt-0.5 break-all">{k}</dt>
          <dd className="text-xs text-ink-200 min-w-0">{renderVal(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
