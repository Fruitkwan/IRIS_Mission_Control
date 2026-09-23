import { Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export function Button({
  variant = 'default',
  size = 'md',
  className,
  loading,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'danger' | 'outline' | 'success';
  size?: 'sm' | 'md' | 'xs';
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' && 'h-8 px-3 text-xs',
        size === 'xs' && 'h-6 px-2 text-[11px]',
        size === 'md' && 'h-9 px-4 text-sm',
        variant === 'default' && 'bg-accent-600 text-white hover:bg-accent-500',
        variant === 'ghost' && 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
        variant === 'outline' && 'border border-ink-700 text-ink-200 hover:bg-ink-800',
        variant === 'danger' && 'bg-red-600/90 text-white hover:bg-red-500',
        variant === 'success' && 'bg-emerald-600 text-white hover:bg-emerald-500',
        className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {props.children}
    </button>
  );
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-ink-700 bg-ink-900 shadow-sm', className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 px-4 py-3 border-b border-ink-700', className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-ink-100 truncate">{title}</h3>
        {subtitle && <p className="text-xs text-ink-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'green' | 'red' | 'amber' | 'blue' | 'teal' | 'purple';
}) {
  const tones = {
    neutral: 'bg-ink-800 text-ink-300 border-ink-600',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    red: 'bg-red-500/10 text-red-400 border-red-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    teal: 'bg-accent-500/10 text-accent-400 border-accent-500/30',
    purple: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-md border border-ink-700 bg-ink-850 px-3 text-sm text-ink-100 placeholder:text-ink-500 outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/40',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-9 rounded-md border border-ink-700 bg-ink-850 px-2 text-sm text-ink-100 outline-none focus:border-accent-500',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-md border border-ink-700 bg-ink-850 px-3 py-2 text-sm font-mono text-ink-100 placeholder:text-ink-500 outline-none focus:border-accent-500',
        className,
      )}
      {...props}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-accent-400', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function EmptyState({
  title = 'Nothing here',
  hint,
  icon,
}: {
  title?: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="text-ink-600">{icon}</div>
      <p className="text-sm text-ink-400">{title}</p>
      {hint && <p className="text-xs text-ink-500 max-w-sm">{hint}</p>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const err = error as { response?: { data?: { message?: string; errors?: { error?: string }[]; status?: number }; status?: number }; message?: string };
  const msg =
    err?.response?.data?.errors?.[0]?.error ||
    err?.response?.data?.message ||
    err?.message ||
    'Request failed';
  const status = err?.response?.status;
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <p className="text-sm text-red-400">
        {status ? `[${status}] ` : ''}
        {String(msg)}
      </p>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 disabled:opacity-40',
        checked ? 'bg-accent-600' : 'bg-ink-700',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}
