import { useState } from 'react';
import { cn } from '../lib/utils';

export function Tabs({
  tabs,
  initial,
}: {
  tabs: { id: string; label: string; content: React.ReactNode }[];
  initial?: string;
}) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-ink-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={cn(
              '-mb-px border-b-2 px-3.5 py-2 text-sm transition-colors',
              active === t.id
                ? 'border-accent-500 text-accent-300 font-medium'
                : 'border-transparent text-ink-400 hover:text-ink-200',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.find((t) => t.id === active)?.content}
    </div>
  );
}
