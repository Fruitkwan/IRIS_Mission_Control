import { useMemo, useState } from 'react';
import { cn } from '../lib/utils';
import { resolveSchema, type SchemaObject } from '../lib/spec';
import { Input, Select, Textarea, Toggle } from './ui';

// Renders a form from an OpenAPI object schema. Produces a plain JSON object.
export function SchemaForm({
  schema,
  value,
  onChange,
  pathPrefix = '',
}: {
  schema: SchemaObject;
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  pathPrefix?: string;
}) {
  const resolved = resolveSchema(schema);
  const props = resolved?.properties ?? {};
  const required = new Set(resolved?.required ?? []);

  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });

  return (
    <div className="space-y-3">
      {Object.entries(props).map(([name, rawProp]) => {
        const prop = resolveSchema(rawProp) ?? {};
        const fieldPath = pathPrefix ? `${pathPrefix}.${name}` : name;
        const label = (
          <span className="flex items-baseline gap-2">
            <span className={cn('text-xs font-medium', required.has(name) ? 'text-ink-100' : 'text-ink-300')}>
              {name}
              {required.has(name) && <span className="text-red-400"> *</span>}
            </span>
            {prop.description && (
              <span className="text-[10px] text-ink-500 line-clamp-1">{prop.description}</span>
            )}
          </span>
        );
        const cur = value[name];

        if (prop.enum) {
          return (
            <div key={fieldPath}>
              <label className="mb-1 block">{label}</label>
              <Select
                className="w-full"
                value={(cur as string) ?? ''}
                onChange={(e) => set(name, e.target.value || undefined)}
              >
                <option value="">—</option>
                {prop.enum.map((o) => (
                  <option key={String(o)} value={String(o)}>
                    {String(o)}
                  </option>
                ))}
              </Select>
            </div>
          );
        }

        if (prop.type === 'boolean') {
          return (
            <div key={fieldPath} className="flex items-center justify-between rounded-md border border-ink-800 px-3 py-2">
              {label}
              <Toggle checked={Boolean(cur)} onChange={(v) => set(name, v)} />
            </div>
          );
        }

        if (prop.type === 'integer' || prop.type === 'number') {
          return (
            <div key={fieldPath}>
              <label className="mb-1 block">{label}</label>
              <Input
                type="number"
                value={cur == null ? '' : String(cur)}
                onChange={(e) =>
                  set(name, e.target.value === '' ? undefined : Number(e.target.value))
                }
              />
            </div>
          );
        }

        if (prop.type === 'array') {
          const itemSchema = resolveSchema(prop.items);
          if (itemSchema?.type === 'object' && itemSchema.properties) {
            return <ArrayOfObjects key={fieldPath} name={name} label={label} itemSchema={itemSchema} items={(cur as Record<string, unknown>[]) ?? []} onChange={(v) => set(name, v)} />;
          }
          return (
            <div key={fieldPath}>
              <label className="mb-1 block">{label}</label>
              <ArrayEditor items={cur} onChange={(v) => set(name, v)} />
            </div>
          );
        }

        if (prop.type === 'object' && prop.properties) {
          return (
            <fieldset key={fieldPath} className="rounded-md border border-ink-800 p-3">
              <legend className="px-1">{label}</legend>
              <SchemaForm
                schema={prop}
                value={(cur as Record<string, unknown>) ?? {}}
                onChange={(v) => set(name, v)}
                pathPrefix={fieldPath}
              />
            </fieldset>
          );
        }

        if (prop.type === 'object' || prop.additionalProperties) {
          return (
            <div key={fieldPath}>
              <label className="mb-1 block">{label}</label>
              <JsonEditor value={cur} onChange={(v) => set(name, v)} />
            </div>
          );
        }

        // string / fallback
        const isLong = prop.format === 'password' || (prop.description?.length ?? 0) > 90;
        return (
          <div key={fieldPath}>
            <label className="mb-1 block">{label}</label>
            {prop.format === 'password' ? (
              <Input
                type="password"
                value={(cur as string) ?? ''}
                onChange={(e) => set(name, e.target.value)}
              />
            ) : isLong ? (
              <Textarea
                rows={3}
                value={(cur as string) ?? ''}
                onChange={(e) => set(name, e.target.value)}
              />
            ) : (
              <Input
                value={(cur as string) ?? ''}
                onChange={(e) => set(name, e.target.value)}
                placeholder={prop.example != null ? String(prop.example) : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ArrayEditor({
  items,
  onChange,
}: {
  items: unknown;
  onChange: (v: string[]) => void;
}) {
  const text = Array.isArray(items) ? items.join('\n') : '';
  return (
    <Textarea
      rows={3}
      value={text}
      placeholder="One value per line"
      onChange={(e) =>
        onChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))
      }
    />
  );
}

function JsonEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => (value == null ? '' : JSON.stringify(value, null, 2)));
  const [err, setErr] = useState(false);
  return (
    <div>
      <Textarea
        rows={4}
        value={text}
        className={cn(err && 'border-red-500')}
        placeholder="{ }"
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(e.target.value.trim() === '' ? undefined : JSON.parse(e.target.value));
            setErr(false);
          } catch {
            setErr(true);
          }
        }}
      />
      {err && <p className="mt-1 text-[10px] text-red-400">Invalid JSON (not saved)</p>}
    </div>
  );
}

function ArrayOfObjects({
  name,
  label,
  itemSchema,
  items,
  onChange,
}: {
  name: string;
  label: React.ReactNode;
  itemSchema: SchemaObject;
  items: Record<string, unknown>[];
  onChange: (v: Record<string, unknown>[]) => void;
}) {
  const list = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  return (
    <fieldset className="rounded-md border border-ink-800 p-3">
      <legend className="px-1">{label}</legend>
      <div className="space-y-4">
        {list.map((item, i) => (
          <div key={i} className="rounded-md border border-ink-800/60 p-2">
            <div className="mb-2 flex justify-between">
              <span className="text-[10px] text-ink-500">
                {name}[{i}]
              </span>
              <button
                type="button"
                className="text-[10px] text-red-400 hover:text-red-300"
                onClick={() => onChange(list.filter((_, j) => j !== i))}
              >
                remove
              </button>
            </div>
            <SchemaForm
              schema={itemSchema}
              value={item}
              onChange={(v) => onChange(list.map((x, j) => (j === i ? v : x)))}
            />
          </div>
        ))}
        <button
          type="button"
          className="text-xs text-accent-400 hover:text-accent-300"
          onClick={() => onChange([...list, {}])}
        >
          + add {name}
        </button>
      </div>
    </fieldset>
  );
}
