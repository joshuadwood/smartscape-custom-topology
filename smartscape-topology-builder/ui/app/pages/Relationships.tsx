import React, { useState } from 'react';
import { Flex } from '@dynatrace/strato-components/layouts';
import { Heading, Text } from '@dynatrace/strato-components/typography';
import { TextInput, Select } from '@dynatrace/strato-components-preview/forms';
import { Button } from '@dynatrace/strato-components/buttons';
import { DataTable } from '@dynatrace/strato-components-preview/tables';
import { ProgressCircle } from '@dynatrace/strato-components/content';
import { MessageContainer } from '@dynatrace/strato-components-preview/content';
import Colors from '@dynatrace/strato-design-tokens/colors';
import { useRelationships } from '../hooks/useRelationships';
import type { RelationshipEntry } from '../types';
import type { DataTableColumnDef } from '@dynatrace/strato-components-preview/tables';
import { ENTITY_TYPES } from '../types';

const columns: DataTableColumnDef<RelationshipEntry>[] = [
  {
    id: 'fromDisplayName',
    header: 'Source Entity',
    accessor: 'fromDisplayName',
    cell: ({ value, rowData }: { value: string; rowData: RelationshipEntry }) => (
      <Flex flexDirection="column">
        <Text style={{ fontWeight: 500, fontSize: 13 }}>{value}</Text>
        <Text color="secondary" style={{ fontSize: 11 }}>{rowData.fromType}</Text>
      </Flex>
    ),
  },
  {
    id: 'direction',
    header: 'Relationship',
    accessor: 'relationshipType',
    cell: ({ value }: { value: string }) => (
      <Flex alignItems="center" gap={6}>
        <span style={{ fontSize: 16 }}>→</span>
        <span style={{
          fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: Colors.Background.Container.Neutral.Accent,
          color: Colors.Text.Neutral.OnAccent.Default, fontWeight: 500,
        }}>
          {value}
        </span>
      </Flex>
    ),
  },
  {
    id: 'toDisplayName',
    header: 'Target Entity',
    accessor: 'toDisplayName',
    cell: ({ value, rowData }: { value: string; rowData: RelationshipEntry }) => (
      <Flex flexDirection="column">
        <Text style={{ fontWeight: 500, fontSize: 13 }}>{value}</Text>
        <Text color="secondary" style={{ fontSize: 11 }}>{rowData.toType}</Text>
      </Flex>
    ),
  },
];

export const Relationships: React.FC = () => {
  const [selectedType, setSelectedType] = useState<string>(ENTITY_TYPES[0].dqlType);
  const [filterText, setFilterText] = useState('');
  const { relationships, isLoading, error, refresh } = useRelationships(selectedType);

  const filtered = relationships.filter((r) => {
    if (!filterText) return true;
    const lower = filterText.toLowerCase();
    return (
      r.fromDisplayName.toLowerCase().includes(lower) ||
      r.toDisplayName.toLowerCase().includes(lower) ||
      r.relationshipType.toLowerCase().includes(lower)
    );
  });

  return (
    <Flex flexDirection="column" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Header bar */}
      <div style={{
        padding: '12px 20px',
        borderBottom: `1px solid ${Colors.Border.Neutral.Default}`,
        background: Colors.Background.Surface.Default,
        flexShrink: 0,
      }}>
        <Flex alignItems="center" gap={12} flexWrap="wrap">
          <Heading level={5} style={{ margin: 0 }}>Existing Relationships</Heading>

          <div style={{ flex: 1 }} />

          <Select
            value={selectedType}
            onChange={(v) => setSelectedType(String(v))}
            style={{ minWidth: 160 }}
          >
            <Select.Content>
              {ENTITY_TYPES.map((et) => (
                <Select.Option key={et.dqlType} value={et.dqlType}>{et.label}</Select.Option>
              ))}
            </Select.Content>
          </Select>

          <TextInput
            placeholder="Filter by entity or relationship..."
            value={filterText}
            onChange={setFilterText}
            style={{ minWidth: 240 }}
          />

          <Button variant="default" onClick={() => void refresh()}>
            Refresh
          </Button>
        </Flex>

        <Text color="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
          Read-only view of existing Smartscape relationships. Existing relationships cannot be deleted here.
        </Text>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {isLoading && (
          <Flex justifyContent="center" alignItems="center" style={{ height: 200 }}>
            <Flex flexDirection="column" alignItems="center" gap={12}>
              <ProgressCircle />
              <Text color="secondary">Loading relationships...</Text>
            </Flex>
          </Flex>
        )}

        {error && (
          <MessageContainer variant="critical">
            <Text>Failed to load relationships: {error.message}</Text>
            <Text color="secondary" style={{ fontSize: 12, marginTop: 4 }}>
              Ensure the app has <code>entity:read</code> scope and is connected to a Dynatrace environment.
            </Text>
          </MessageContainer>
        )}

        {!isLoading && !error && (
          <>
            <Flex alignItems="center" gap={8} style={{ marginBottom: 12 }}>
              <Text color="secondary" style={{ fontSize: 13 }}>
                {filtered.length} relationship{filtered.length !== 1 ? 's' : ''} found
                {filterText && ` (filtered from ${relationships.length})`}
              </Text>
            </Flex>

            {filtered.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '60px 20px',
                background: Colors.Background.Surface.Backdrop,
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
                <Text color="secondary" style={{ fontSize: 15, display: 'block' }}>
                  {filterText ? 'No relationships match your filter.' : 'No relationships found for this entity type.'}
                </Text>
                <Text color="secondary" style={{ fontSize: 13, marginTop: 4, display: 'block' }}>
                  Try selecting a different entity type or refreshing.
                </Text>
              </div>
            ) : (
              <>
                <DataTable
                  data={filtered}
                  columns={columns}
                  sortable
                />
                <RelationshipFlowGraph relationships={filtered} />
              </>
            )}
          </>
        )}
      </div>
    </Flex>
  );
};

// Simple visual flow diagram showing entity connections
interface RelationshipFlowGraphProps {
  relationships: RelationshipEntry[];
}

const RelationshipFlowGraph: React.FC<RelationshipFlowGraphProps> = ({ relationships }) => {
  if (relationships.length === 0 || relationships.length > 100) return null;

  // Collect unique nodes
  const nodeMap = new Map<string, { id: string; label: string; type: string }>();
  relationships.forEach((r) => {
    if (!nodeMap.has(r.fromEntityId)) {
      nodeMap.set(r.fromEntityId, { id: r.fromEntityId, label: r.fromDisplayName, type: r.fromType });
    }
    if (!nodeMap.has(r.toEntityId)) {
      nodeMap.set(r.toEntityId, { id: r.toEntityId, label: r.toDisplayName, type: r.toType });
    }
  });

  const nodes = Array.from(nodeMap.values());
  if (nodes.length > 30) return null; // Skip graph for too many nodes

  // Simple circular layout
  const cx = 400, cy = 250, radius = 180;
  const nodePositions = new Map<string, { x: number; y: number }>();
  nodes.forEach((node, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
    nodePositions.set(node.id, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  });

  const NODE_R = 6;

  return (
    <div style={{ marginTop: 24 }}>
      <Heading level={6}>Relationship Flow</Heading>
      <Text color="secondary" style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
        Visual overview of entity relationships (read-only)
      </Text>
      <div style={{
        background: Colors.Background.Surface.Backdrop,
        borderRadius: 8, overflow: 'auto',
      }}>
        <svg width={800} height={500} style={{ display: 'block', margin: '0 auto' }}>
          <defs>
            <marker id="rel-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={Colors.Charts.Categorical.Color01.Default} />
            </marker>
          </defs>

          {/* Edges */}
          {relationships.map((r, i) => {
            const src = nodePositions.get(r.fromEntityId);
            const tgt = nodePositions.get(r.toEntityId);
            if (!src || !tgt) return null;
            const midX = (src.x + tgt.x) / 2;
            const midY = (src.y + tgt.y) / 2;
            return (
              <g key={i}>
                <line
                  x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                  stroke={Colors.Charts.Categorical.Color01.Default}
                  strokeWidth={1.5}
                  markerEnd="url(#rel-arrow)"
                  opacity={0.6}
                />
                <text x={midX} y={midY - 4} textAnchor="middle" fontSize={9}
                  fill={Colors.Text.Neutral.Subdued} style={{ userSelect: 'none' }}>
                  {r.relationshipType}
                </text>
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;
            return (
              <g key={node.id}>
                <circle
                  cx={pos.x} cy={pos.y} r={NODE_R + 2}
                  fill={Colors.Background.Surface.Default}
                  stroke={Colors.Border.Neutral.Accent}
                  strokeWidth={2}
                />
                <text x={pos.x} y={pos.y + 16} textAnchor="middle" fontSize={10}
                  fill={Colors.Text.Neutral.Default} style={{ userSelect: 'none' }}>
                  {node.label.length > 18 ? node.label.slice(0, 15) + '…' : node.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
