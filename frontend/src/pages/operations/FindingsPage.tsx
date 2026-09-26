import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from '../../components/DataTable';
import { Badge, PageLoader } from '../../components/ui';
import { Drawer } from '../../components/DetailDrawer';
import { EvidenceView } from '../../components/FindingCard';
import { SEV_TONE } from '../../health/severity';
import { useHealthReport } from '../../health/useHealth';
import type { Finding } from '../../health/types';
import { fmtDate } from '../../lib/utils';

export function FindingsPage() {
  const report = useHealthReport();
  const [selected, setSelected] = useState<Finding | null>(null);

  if (report.isLoading) return <PageLoader />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Findings"
        description="All active findings from the health rules engine"
      />
      <DataTable<Finding>
        columns={[
          {
            key: 'severity',
            header: 'Severity',
            sortValue: (f) => ['critical', 'warning', 'info', 'recommendation'].indexOf(f.severity),
            render: (f) => <Badge tone={SEV_TONE[f.severity]}>{f.severity}</Badge>,
          },
          { key: 'category', header: 'Category', render: (f) => <Badge tone="neutral">{f.category}</Badge> },
          { key: 'title', header: 'Finding', className: 'w-full' },
          { key: 'detectedAt', header: 'Detected', render: (f) => <span className="text-xs text-ink-400">{fmtDate(f.detectedAt)}</span> },
        ]}
        rows={report.data?.findings ?? []}
        loading={report.isFetching}
        rowKey={(f) => f.id}
        onRowClick={setSelected}
      />
      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.title ?? ''}>
        {selected && <EvidenceView finding={selected} />}
      </Drawer>
    </div>
  );
}
