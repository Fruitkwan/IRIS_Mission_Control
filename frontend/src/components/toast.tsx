import { useCallback, useState } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import { cn } from '../lib/utils';

import { Ctx } from './toast-context';

type Toast = { id: number; kind: 'ok' | 'err'; text: string };

let nid = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((kind: 'ok' | 'err', text: string) => {
    const id = nid++;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'err' ? 8000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-96 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm shadow-lg animate-fade-in',
              t.kind === 'ok'
                ? 'border-emerald-500/40 bg-emerald-950/95 text-emerald-200'
                : 'border-red-500/40 bg-red-950/95 text-red-200',
            )}
          >
            {t.kind === 'ok' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            )}
            <span className="flex-1 break-words">{t.text}</span>
            <button
              className="text-ink-500 hover:text-ink-300"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
