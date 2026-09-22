import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { axios } from '../api/axios-instance';
import { resultOf } from '../api/helpers';
import { DataTable, type Column } from '../components/DataTable';
import { Drawer, KeyValueGrid } from '../components/DetailDrawer';
import { PageHeader } from '../components/PageHeader';
import { SchemaForm } from '../components/SchemaForm';
import { Button, Card, Input } from '../components/ui';
import { useToast, errText } from '../components/toast';
import { requestSchema, resolveSchema } from '../lib/spec';
import type { UseQueryResult } from '@tanstack/react-query';

type Ops = {
  get?: string;
  create?: string; // operationId used to locate request schema
  update?: string;
  delete?: string;
};

export function ResourcePage<T extends Record<string, unknown>>({
  title,
  description,
  listHook,
  singlePath,
  nameKey,
  ops = {},
  columns,
  rowKey,
  createLabel = 'New',
  toolbar,
  headerActions,
  rowActions,
  drawerActions,
  extraDetail,
  hideEdit,
  hideDelete,
  // identity
  rowParams,
  createParam = 'name',
  createMethod = 'post',
  readOnlyDetail,
}: {
  title: string;
  description?: string;
  listHook: (args?: never) => UseQueryResult<unknown>;
  singlePath?: string;
  nameKey: string | ((row: T) => string);
  ops?: Ops;
  columns: Column<T>[];
  rowKey?: (row: T, i: number) => string;
  createLabel?: string;
  toolbar?: React.ReactNode;
  headerActions?: React.ReactNode;
  rowActions?: (row: T, refresh: () => void) => React.ReactNode;
  drawerActions?: (row: T, refresh: () => void) => React.ReactNode;
  extraDetail?: (row: T) => React.ReactNode;
  hideEdit?: boolean;
  hideDelete?: boolean;
  rowParams?: (row: T) => Record<string, string>;
  createParam?: string | null;
  createMethod?: 'post' | 'put';
  readOnlyDetail?: boolean;
}) {
  const list = listHook();
  const rows = resultOf<T[]>(list.data) ?? [];
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selected, setSelected] = useState<T | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'create' | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const nameOf = (row: T) => (typeof nameKey === 'function' ? nameKey(row) : String(row[nameKey] ?? ''));
  const paramsOf = (row: T) => rowParams?.(row) ?? { [createParam ?? 'name']: nameOf(row) };
  const refresh = () => qc.invalidateQueries();

  const openDetail = async (row: T) => {
    setSelected(row);
    setMode('view');
    setDetail(null);
    setConfirmDelete(false);
    if (singlePath && ops.get) {
      setDetailLoading(true);
      try {
        const { data } = await axios.get(singlePath, { params: paramsOf(row) });
        setDetail(resultOf<Record<string, unknown>>(data) ?? (data as Record<string, unknown>));
      } catch {
        setDetail(row);
      } finally {
        setDetailLoading(false);
      }
    } else {
      setDetail(row);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'create') {
        const params = createParam ? { [createParam]: newName } : {};
        if (createMethod === 'put') await axios.put(singlePath!, form, { params });
        else await axios.post(singlePath!, form, { params });
        toast('ok', `${title} created`);
        setMode(null);
      } else if (mode === 'edit' && selected) {
        await axios.put(singlePath!, form, { params: paramsOf(selected) });
        toast('ok', `${title} updated`);
        setMode('view');
        openDetail(selected);
      }
      refresh();
    } catch (e) {
      toast('err', errText(e));
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await axios.delete(singlePath!, { params: paramsOf(selected) });
      toast('ok', `${title} deleted`);
      setSelected(null);
      setMode(null);
      refresh();
    } catch (e) {
      toast('err', errText(e));
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  };

  const createSchema = ops.create ? resolveSchema(requestSchema(ops.create)) : undefined;
  const updateSchema = ops.update ? resolveSchema(requestSchema(ops.update)) : undefined;
  const canCreate = Boolean(ops.create && singlePath && createSchema?.properties);
  const canEdit =
    Boolean(ops.update && singlePath && updateSchema?.properties) && !hideEdit && !readOnlyDetail;
  const canDelete = Boolean(ops.delete && singlePath) && !hideDelete;

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        actions={
          <>
            {headerActions}
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            {canCreate && (
              <Button
                size="sm"
                onClick={() => {
                  setMode('create');
                  setForm({});
                  setNewName('');
                }}
              >
                <Plus className="h-3.5 w-3.5" /> {createLabel}
              </Button>
            )}
          </>
        }
      />
      <Card className="p-4">
        <DataTable
          columns={
            rowActions
              ? [
                  ...columns,
                  {
                    key: '__actions',
                    header: '',
                    searchable: false,
                    className: 'w-px whitespace-nowrap text-right',
                    render: (r: T) => (
                      <span onClick={(e) => e.stopPropagation()}>{rowActions(r, refresh)}</span>
                    ),
                  },
                ]
              : columns
          }
          rows={rows}
          loading={list.isLoading}
          error={list.error}
          onRetry={refresh}
          rowKey={rowKey ?? ((r, i) => nameOf(r) + i)}
          onRowClick={openDetail}
          toolbar={toolbar}
        />
      </Card>

      <Drawer
        open={(mode === 'view' || mode === 'edit') && !!selected}
        onClose={() => {
          setSelected(null);
          setMode(null);
        }}
        title={selected ? nameOf(selected) : ''}
        wide={mode === 'edit'}
      >
        {detailLoading && <p className="text-xs text-ink-500">Loading…</p>}
        {mode === 'view' && detail && selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForm({ ...detail });
                    setMode('edit');
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
              {drawerActions?.(selected, refresh)}
              {canDelete &&
                (confirmDelete ? (
                  <>
                    <Button size="sm" variant="danger" loading={busy} onClick={doDelete}>
                      Confirm delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                ))}
            </div>
            <KeyValueGrid data={detail} />
            {extraDetail?.(selected)}
          </div>
        )}
        {mode === 'edit' && updateSchema && (
          <div className="space-y-4">
            <SchemaForm schema={updateSchema} value={form} onChange={setForm} />
            <div className="flex gap-2 pt-2">
              <Button size="sm" loading={busy} onClick={submit}>
                Save changes
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode('view')}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Drawer open={mode === 'create'} onClose={() => setMode(null)} title={createLabel} wide>
        {createSchema && (
          <div className="space-y-4">
            {createParam && (
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-100">
                  {createParam} <span className="text-red-400">*</span>
                </label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={`Unique ${createParam}`}
                />
              </div>
            )}
            <SchemaForm schema={createSchema} value={form} onChange={setForm} />
            <div className="flex gap-2 pt-2">
              <Button size="sm" loading={busy} disabled={Boolean(createParam) && !newName} onClick={submit}>
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
