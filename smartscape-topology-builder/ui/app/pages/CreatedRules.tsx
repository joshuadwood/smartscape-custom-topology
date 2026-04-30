import React, { useState, useEffect, useCallback } from 'react';
import { Flex } from '@dynatrace/strato-components/layouts';
import { Heading, Text, Strong } from '@dynatrace/strato-components/typography';
import { Button } from '@dynatrace/strato-components/buttons';
import { DataTable } from '@dynatrace/strato-components-preview/tables';
import { ProgressCircle } from '@dynatrace/strato-components/content';
import { MessageContainer } from '@dynatrace/strato-components-preview/content';
import Colors from '@dynatrace/strato-design-tokens/colors';
import { listGenericTypes, listGenericRelationships, getExistingTopologyRules } from '../api/topology';
import { useDql } from '@dynatrace-sdk/react-hooks';
import type { DataTableColumnDef } from '@dynatrace/strato-components-preview/tables';

interface TypeRule {
  objectId: string;
  name: string;
  displayName: string;
  createdBy: string;
}

interface RelRule {
  objectId: string;
  fromType: string;
  toType: string;
  typeOfRelation: string;
  createdBy: string;
}

const CREATED_BY = 'Smartscape Topology Builder App';

const typeColumns: DataTableColumnDef<TypeRule>[] = [
  { id: 'name', header: 'Type Name', accessor: 'name' },
  { id: 'displayName', header: 'Display Name', accessor: 'displayName' },
  {
    id: 'objectId',
    header: 'Object ID',
    accessor: 'objectId',
    cell: ({ value }: { value: string }) => (
      <Text color="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>{value}</Text>
    ),
  },
];

const relColumns: DataTableColumnDef<RelRule>[] = [
  { id: 'fromType', header: 'From Type', accessor: 'fromType' },
  {
    id: 'relation',
    header: 'Relation',
    accessor: 'typeOfRelation',
    cell: ({ value }: { value: string }) => (
      <span style={{
        fontSize: 11, padding: '2px 8px', borderRadius: 10,
        background: Colors.Background.Container.Neutral.Accent,
        color: Colors.Text.Neutral.OnAccent.Default, fontWeight: 500,
      }}>
        {value}
      </span>
    ),
  },
  { id: 'toType', header: 'To Type', accessor: 'toType' },
  {
    id: 'objectId',
    header: 'Object ID',
    accessor: 'objectId',
    cell: ({ value }: { value: string }) => (
      <Text color="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>{value}</Text>
    ),
  },
];

export const CreatedRules: React.FC = () => {
  const [types, setTypes] = useState<TypeRule[]>([]);
  const [rels, setRels] = useState<RelRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Query custom.topology.* metrics ingested by this app
  const metricsQuery = useDql({
    query: 'timeseries count = avg(custom.topology.bridge), by: {bridge_id} | summarize total = count(), latest = max(timeframe) | fields total, latest',
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allTypes, allRels] = await Promise.all([
        listGenericTypes(),
        listGenericRelationships(),
      ]);
      setTypes(allTypes.filter((t) => t.createdBy === CREATED_BY));
      setRels(allRels.filter((r) => r.createdBy === CREATED_BY));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const evtCount = metricsQuery.data?.records?.[0]?.total as number | undefined;
  const evtLatest = metricsQuery.data?.records?.[0]?.latest as string | undefined;

  return (
    <Flex flexDirection="column" style={{ height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '12px 20px',
        borderBottom: `1px solid ${Colors.Border.Neutral.Default}`,
        background: Colors.Background.Surface.Default,
        flexShrink: 0,
      }}>
        <Flex alignItems="center" gap={12}>
          <Heading level={5} style={{ margin: 0 }}>Created Rules</Heading>
          <div style={{ flex: 1 }} />
          <Button variant="default" onClick={() => void refresh()}>Refresh</Button>
        </Flex>
        <Text color="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
          Settings objects and metrics created by this app. Rules are processed by the extraction engine to create Smartscape topology.
        </Text>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {loading && (
          <Flex justifyContent="center" alignItems="center" style={{ height: 200 }}>
            <Flex flexDirection="column" alignItems="center" gap={12}>
              <ProgressCircle />
              <Text color="secondary">Loading rules...</Text>
            </Flex>
          </Flex>
        )}

        {error && (
          <MessageContainer variant="critical">
            <Text>Failed to load rules: {error}</Text>
          </MessageContainer>
        )}

        {!loading && !error && (
          <Flex flexDirection="column" gap={24}>
            {/* Metrics Ingest Status */}
            <StatusCard
              title="Metrics Ingest Status"
              icon="📊"
              items={[
                { label: 'Bridge metrics found', value: metricsQuery.isLoading ? '...' : String(evtCount ?? 0) },
                { label: 'Latest data', value: metricsQuery.isLoading ? '...' : (evtLatest ? new Date(evtLatest).toLocaleString() : 'N/A') },
                { label: 'Ingest method', value: 'API token via live.dynatrace.com' },
                { label: 'Source type', value: 'Metrics ($prefix)' },
              ]}
              status={evtCount && evtCount > 0 ? 'ok' : 'warning'}
              statusText={evtCount && evtCount > 0 ? 'Data ingested' : 'No metrics yet'}
            />

            {/* Extraction Engine Status */}
            <ExtractionStatus />

            {/* Generic Types */}
            <div>
              <Flex alignItems="center" gap={8} style={{ marginBottom: 8 }}>
                <Heading level={6}>Generic Entity Types ({types.length})</Heading>
              </Flex>

              {types.length === 0 ? (
                <EmptyState message="No generic types created by this app yet." />
              ) : (
                <DataTable data={types} columns={typeColumns} sortable />
              )}
            </div>

            {/* Relationships */}
            <div>
              <Flex alignItems="center" gap={8} style={{ marginBottom: 8 }}>
                <Heading level={6}>Relationship Rules ({rels.length})</Heading>
              </Flex>

              {rels.length === 0 ? (
                <EmptyState message="No relationship rules created by this app yet." />
              ) : (
                <DataTable data={rels} columns={relColumns} sortable />
              )}
            </div>
          </Flex>
        )}
      </div>
    </Flex>
  );
};

// ─── Extraction Engine Status ────────────────────────────────────────────────

const ExtractionStatus: React.FC = () => {
  // Check if bridge entities have been extracted from topology metrics
  const bridgeQuery = useDql({
    query: 'fetch dt.entity.custom:topology_bridge | summarize bridges = count(), latest = max(lifetime[end]) | fields bridges, latest',
  });

  const bridgeCount = bridgeQuery.data?.records?.[0]?.bridges as number | undefined;
  const hasData = bridgeCount !== undefined && bridgeCount > 0;

  return (
    <StatusCard
      title="Extraction Engine Status"
      icon="⚙️"
      items={[
        {
          label: 'Bridge entities',
          value: bridgeQuery.isLoading ? 'Checking...'
            : hasData ? `${bridgeCount} bridge entity/entities extracted`
            : 'No bridge entities yet',
        },
        {
          label: 'Source type',
          value: 'Metrics with $prefix(custom.topology.bridge)',
        },
        {
          label: 'Note',
          value: 'The extraction engine processes ingested metrics matching $prefix() conditions to create entities and relationships. This can take 5-15 minutes after metric ingest.',
        },
      ]}
      status={bridgeQuery.isLoading ? 'neutral' : hasData ? 'ok' : 'warning'}
      statusText={bridgeQuery.isLoading ? 'Checking' : hasData ? 'Events ingested' : 'Waiting'}
    />
  );
};

// ─── Shared components ───────────────────────────────────────────────────────

interface StatusCardProps {
  title: string;
  icon: string;
  items: { label: string; value: string }[];
  status: 'ok' | 'warning' | 'neutral';
  statusText: string;
}

const StatusCard: React.FC<StatusCardProps> = ({ title, icon, items, status, statusText }) => {
  const statusColor = status === 'ok'
    ? Colors.Text.Success.Default
    : status === 'warning'
    ? Colors.Text.Warning.Default
    : Colors.Text.Neutral.Subdued;

  return (
    <div style={{
      padding: 16, borderRadius: 8,
      border: `1px solid ${Colors.Border.Neutral.Default}`,
      background: Colors.Background.Surface.Default,
    }}>
      <Flex alignItems="center" gap={8} style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <Heading level={6} style={{ margin: 0 }}>{title}</Heading>
        <div style={{ flex: 1 }} />
        <span style={{
          fontSize: 12, padding: '2px 10px', borderRadius: 10,
          background: status === 'ok' ? Colors.Background.Container.Success.Default
            : status === 'warning' ? Colors.Background.Container.Warning.Default
            : Colors.Background.Surface.Backdrop,
          color: statusColor, fontWeight: 600,
        }}>
          {statusText}
        </span>
      </Flex>
      {items.map((item) => (
        <Flex key={item.label} alignItems="baseline" gap={8} style={{ marginBottom: 4 }}>
          <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued, minWidth: 160 }}>{item.label}</Text>
          <Text style={{ fontSize: 13 }}>{item.value}</Text>
        </Flex>
      ))}
    </div>
  );
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div style={{
    textAlign: 'center', padding: '32px 20px',
    background: Colors.Background.Surface.Backdrop,
    borderRadius: 8,
  }}>
    <Text color="secondary" style={{ fontSize: 13 }}>{message}</Text>
  </div>
);
