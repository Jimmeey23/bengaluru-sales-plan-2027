'use client';

import { Badge, Card, CardHeader, EmptyState, Table, Td, Th } from '@/components/ui';
import { dateTimeLabel } from '@/lib/format';

export function ImportsLog({ imports }: { imports: any[] }) {
  return (
    <Card>
      <CardHeader
        title="Import history"
        subtitle="Every catalogue import is logged with its per-row outcome — rejected rows are never written"
      />
      {imports.length === 0 ? (
        <EmptyState compact title="No imports yet" description="Upload a price list from the Import button above. In local mode the platform parses CSV; nothing is written until you confirm the preview." />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <thead><tr><Th>File</Th><Th>Kind</Th><Th align="right">Rows</Th><Th align="right">Created</Th><Th align="right">Updated</Th><Th align="right">Flagged</Th><Th align="right">Rejected</Th><Th>Status</Th><Th>When</Th></tr></thead>
            <tbody>
              {imports.map(i => (
                <tr key={i.id}>
                  <Td><span className="text-ink">{i.filename}</span></Td>
                  <Td><span className="text-muted">{i.kind}</span></Td>
                  <Td align="right"><span className="num">{i.rows}</span></Td>
                  <Td align="right"><span className="num">{i.inserted}</span></Td>
                  <Td align="right"><span className="num">{i.updated}</span></Td>
                  <Td align="right"><span className="num text-gold-600 dark:text-gold-300">{i.flagged}</span></Td>
                  <Td align="right"><span className="num text-clay-600 dark:text-clay-400">{i.rejected}</span></Td>
                  <Td><Badge tone={i.status === 'processed' ? 'success' : 'warning'}>{i.status.replace('_', ' ')}</Badge></Td>
                  <Td><span className="text-2xs text-muted">{dateTimeLabel(i.createdAt)}</span></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}
