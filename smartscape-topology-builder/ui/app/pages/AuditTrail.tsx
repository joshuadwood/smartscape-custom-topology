import React, { useState, useEffect, useCallback } from 'react';
import { Flex } from '@dynatrace/strato-components/layouts';
import { Heading, Text, Strong } from '@dynatrace/strato-components/typography';
import { Button } from '@dynatrace/strato-components/buttons';
import { ProgressCircle } from '@dynatrace/strato-components/content';
import Colors from '@dynatrace/strato-design-tokens/colors';
import { getAuditTrail } from '../api/audit';
import type { AuditEntry, AuditEdge } from '../types';

export const AuditTrail: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const trail = await getAuditTrail();
      setEntries(trail);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <Flex flexDirection="column" gap={16} padding={24} style={{ height: '100%', overflowY: 'auto' }}>
      <Flex justifyContent="space-between" alignItems="center">
        <Heading level={5}>Audit Trail</Heading>
        <Button variant="default" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Loading...' : '↻ Refresh'}
        </Button>
      </Flex>

      <Text style={{ fontSize: 13, color: Colors.Text.Neutral.Subdued }}>
        History of topology rules created through this app. Shows entities linked, direction, and outcome.
      </Text>

      {loading && entries.length === 0 && (
        <Flex justifyContent="center" padding={32}>
          <ProgressCircle />
        </Flex>
      )}

      {error && (
        <div style={{
          background: Colors.Background.Container.Critical.Default,
          border: `1px solid ${Colors.Border.Critical.Default}`,
          borderRadius: 6, padding: 12,
        }}>
          <Text style={{ fontSize: 12, color: Colors.Text.Critical.Default }}>{error}</Text>
        </div>
      )}

      {!loading && entries.length === 0 && !error && (
        <div style={{
          padding: 32, textAlign: 'center',
          borderRadius: 8, border: `1px dashed ${Colors.Border.Neutral.Default}`,
        }}>
          <Text style={{ fontSize: 14, color: Colors.Text.Neutral.Subdued }}>
            No topology rules have been created yet. Use the Topology Builder to create your first rule.
          </Text>
        </div>
      )}

      {entries.map((entry) => {
        const isExpanded = expandedId === entry.id;
        const hasErrors = entry.errors.length > 0 || entry.metricErrors.length > 0;
        const ts = new Date(entry.timestamp);
        const timeStr = ts.toLocaleString();

        return (
          <div
            key={entry.id}
            style={{
              border: `1px solid ${hasErrors ? Colors.Border.Warning.Default : Colors.Border.Neutral.Default}`,
              borderRadius: 8,
              background: Colors.Background.Container.Neutral.Default,
              overflow: 'hidden',
            }}
          >
            {/* Header row — clickable */}
            <button
              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', cursor: 'pointer', border: 'none',
                background: 'transparent', textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued, minWidth: 16 }}>
                {isExpanded ? '▾' : '▸'}
              </span>
              <span style={{ fontSize: 13, color: Colors.Text.Neutral.Default, minWidth: 170 }}>
                {timeStr}
              </span>
              <Flex gap={8} alignItems="center" style={{ flex: 1 }}>
                {entry.edges.map((edge, i) => (
                  <EdgeBadge key={i} edge={edge} />
                ))}
              </Flex>
              <Flex gap={8} alignItems="center">
                {entry.typesCreated.length > 0 && (
                  <CountBadge label="types" count={entry.typesCreated.length} />
                )}
                <CountBadge label="rels" count={entry.relationshipsCreated.length} />
                <CountBadge label="metrics" count={entry.metricsIngested} />
                {hasErrors && (
                  <CountBadge label="errors" count={entry.errors.length + entry.metricErrors.length} />
                )}
              </Flex>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{
                padding: '0 16px 16px 44px',
                borderTop: `1px solid ${Colors.Border.Neutral.Default}`,
              }}>
                {/* Edges detail */}
                <Heading level={6} style={{ marginTop: 12, marginBottom: 8 }}>Linked Entities</Heading>
                <div style={{ display: 'grid', gap: 6 }}>
                  {entry.edges.map((edge, i) => (
                    <EdgeDetailRow key={i} edge={edge} />
                  ))}
                </div>

                {/* Types created */}
                {entry.typesCreated.length > 0 && (
                  <>
                    <Heading level={6} style={{ marginTop: 16, marginBottom: 6 }}>Types Created</Heading>
                    <Flex gap={6} style={{ flexWrap: 'wrap' }}>
                      {entry.typesCreated.map((t) => (
                        <span key={t} style={{
                          fontSize: 12, padding: '2px 10px', borderRadius: 10,
                          background: Colors.Background.Container.Primary.Default,
                          border: `1px solid ${Colors.Border.Primary.Default}`,
                          color: Colors.Text.Primary.Default,
                        }}>
                          {t}
                        </span>
                      ))}
                    </Flex>
                  </>
                )}

                {/* Relationships created */}
                {entry.relationshipsCreated.length > 0 && (
                  <>
                    <Heading level={6} style={{ marginTop: 16, marginBottom: 6 }}>Relationship Rules Created</Heading>
                    <Flex flexDirection="column" gap={4}>
                      {entry.relationshipsCreated.map((r, i) => (
                        <Text key={i} style={{ fontSize: 12, color: Colors.Text.Success.Default }}>
                          {r}
                        </Text>
                      ))}
                    </Flex>
                  </>
                )}

                {/* Metrics */}
                <Flex gap={16} style={{ marginTop: 16 }}>
                  <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>
                    Metrics ingested: <Strong>{entry.metricsIngested}</Strong>
                  </Text>
                </Flex>

                {/* Errors */}
                {entry.errors.length > 0 && (
                  <>
                    <Heading level={6} style={{ marginTop: 16, marginBottom: 6, color: Colors.Text.Critical.Default }}>Errors</Heading>
                    {entry.errors.map((e, i) => (
                      <Text key={i} style={{ fontSize: 12, color: Colors.Text.Critical.Default, display: 'block', marginBottom: 4 }}>
                        {e}
                      </Text>
                    ))}
                  </>
                )}
                {entry.metricErrors.length > 0 && (
                  <>
                    <Heading level={6} style={{ marginTop: 12, marginBottom: 6, color: Colors.Text.Warning.Default }}>Metric Ingest Warnings</Heading>
                    {entry.metricErrors.map((e, i) => (
                      <Text key={i} style={{ fontSize: 12, color: Colors.Text.Warning.Default, display: 'block', marginBottom: 4 }}>
                        {e}
                      </Text>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </Flex>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const EdgeBadge: React.FC<{ edge: AuditEdge }> = ({ edge }) => {
  const arrow = edge.bidirectional ? ' ↔ ' : ' → ';
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 10,
      background: Colors.Background.Container.Neutral.Accent,
      color: Colors.Text.Neutral.OnAccent.Default,
      whiteSpace: 'nowrap', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {edge.sourceDisplayName}{arrow}{edge.targetDisplayName}
    </span>
  );
};

const EdgeDetailRow: React.FC<{ edge: AuditEdge }> = ({ edge }) => {
  const arrow = edge.bidirectional ? '↔' : '→';
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr auto',
      gap: 8,
      alignItems: 'center',
      padding: '6px 12px',
      borderRadius: 6,
      background: `${Colors.Background.Container.Neutral.Default}`,
      border: `1px solid ${Colors.Border.Neutral.Default}`,
      fontSize: 12,
    }}>
      <div>
        <div style={{ fontWeight: 600, color: Colors.Text.Primary.Default }}>
          {edge.sourceDisplayName}
        </div>
        <div style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued }}>
          {edge.sourceEntityId}
        </div>
      </div>
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
      }}>
        <span style={{
          fontSize: 16, fontWeight: 700,
          color: edge.bidirectional ? Colors.Text.Success.Default : Colors.Text.Primary.Default,
        }}>
          {arrow}
        </span>
        <span style={{
          fontSize: 10, padding: '1px 6px', borderRadius: 8,
          background: Colors.Background.Container.Success.Default,
          border: `1px solid ${Colors.Border.Success.Default}`,
          color: Colors.Text.Success.Default, whiteSpace: 'nowrap',
        }}>
          {edge.relationshipType}
        </span>
      </div>
      <div>
        <div style={{ fontWeight: 600, color: Colors.Text.Primary.Default }}>
          {edge.targetDisplayName}
        </div>
        <div style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued }}>
          {edge.targetEntityId}
        </div>
      </div>
      <div style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued, textAlign: 'right' }}>
        {edge.bidirectional ? 'bidirectional' : 'one-way'}
      </div>
    </div>
  );
};

const BADGE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  types: { bg: Colors.Background.Container.Primary.Default, border: Colors.Border.Primary.Default, text: Colors.Text.Primary.Default },
  rels: { bg: Colors.Background.Container.Success.Default, border: Colors.Border.Success.Default, text: Colors.Text.Success.Default },
  metrics: { bg: Colors.Background.Container.Warning.Default, border: Colors.Border.Warning.Default, text: Colors.Text.Warning.Default },
  errors: { bg: Colors.Background.Container.Critical.Default, border: Colors.Border.Critical.Default, text: Colors.Text.Critical.Default },
};

const CountBadge: React.FC<{ label: string; count: number }> = ({ label, count }) => {
  const style = BADGE_STYLES[label] ?? { bg: Colors.Background.Surface.Backdrop, border: Colors.Border.Neutral.Default, text: Colors.Text.Neutral.Default };
  return (
    <span style={{
      fontSize: 11, padding: '2px 8px', borderRadius: 10,
      background: style.bg, border: `1px solid ${style.border}`,
      color: style.text, whiteSpace: 'nowrap',
    }}>
      {count} {label}
    </span>
  );
};
