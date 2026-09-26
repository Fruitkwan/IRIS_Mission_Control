import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn } from '../lib/utils';
import { axios } from '../api/axios-instance';

export type PaletteItem = { label: string; hint?: string; to?: string; run?: () => void };

// Universal entity search: lazily loaded once per session.
let entityCache: PaletteItem[] | null = null;
async function loadEntities(): Promise<PaletteItem[]> {
  if (entityCache) return entityCache;
  const out: PaletteItem[] = [];
  const grab = async (path: string, map: (r: Record<string, unknown>) => PaletteItem | null) => {
    try {
      const { data } = await axios.get(path);
      for (const r of data?.result ?? []) {
        const it = map(r);
        if (it) out.push(it);
      }
    } catch { /* endpoint unavailable — skip */ }
  };
  await Promise.all([
    grab('/v2/databases', (r) => ({ label: `Database: ${r.Name}`, hint: 'database', to: '/databases' })),
    grab('/v2/namespaces', (r) => ({ label: `Namespace: ${r.Name}`, hint: 'namespace', to: '/namespaces' })),
    grab('/v2/security/users', (r) => ({ label: `User: ${r.Name}`, hint: 'security', to: '/security/users' })),
    grab('/v2/security/roles', (r) => ({ label: `Role: ${r.Name}`, hint: 'role', to: '/security/roles' })),
    grab('/v2/web-apps', (r) => ({ label: `Web app: ${r.Name}`, hint: 'web app', to: '/web-apps' })),
    grab('/v2/tasks', (r) => ({ label: `Task: ${r.Name}`, hint: 'task', to: '/tasks' })),
  ]);
  entityCache = out;
  return out;
}

/** Mounted only while open, so the search and selection start fresh each time. */
export function CommandPalette({ open, ...props }: { open: boolean; onClose: () => void; items: PaletteItem[] }) {
  return open ? <PaletteDialog {...props} /> : null;
}

function PaletteDialog({ onClose, items }: { onClose: () => void; items: PaletteItem[] }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [entities, setEntities] = useState<PaletteItem[]>([]);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const f = q.toLowerCase();
    const pages = items.filter((i) => i.label.toLowerCase().includes(f));
    const ents = q.length >= 2 ? entities.filter((i) => i.label.toLowerCase().includes(f)) : [];
    return [...pages, ...ents].slice(0, 14);
  }, [items, entities, q]);

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    loadEntities().then(setEntities);
    return () => clearTimeout(timer);
  }, []);



  const pick = (i: PaletteItem) => {
    onClose();
    if (i.to) navigate(i.to);
    i.run?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-ink-700 px-4">
          <Search className="h-4 w-4 text-ink-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIdx((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === 'Enter' && filtered[idx]) {
                pick(filtered[idx]);
              } else if (e.key === 'Escape') onClose();
            }}
            placeholder="Jump to a page or run an action…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-500"
          />
          <kbd className="rounded border border-ink-700 px-1.5 py-0.5 text-[10px] text-ink-500">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {filtered.map((it, i) => (
            <button
              key={it.label + i}
              onClick={() => pick(it)}
              onMouseEnter={() => setIdx(i)}
              className={cn(
                'flex w-full items-center justify-between px-4 py-2.5 text-left text-sm',
                i === idx ? 'bg-accent-600/15 text-accent-300' : 'text-ink-200',
              )}
            >
              <span>{it.label}</span>
              {it.hint && <span className="text-[10px] text-ink-500">{it.hint}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-ink-500">No matches</p>
          )}
        </div>
      </div>
    </div>
  );
}
