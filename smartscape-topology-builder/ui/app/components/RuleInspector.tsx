import React from 'react';
import type { CanvasEdge, CanvasEntity } from '../types';

interface RuleInspectorProps {
  edges: CanvasEdge[];
  entities: CanvasEntity[];
  selectedEdgeId: string | null;
  onEdgeRemove: (edgeId: string) => void;
}

const TYPE_ACCENT: Record<string, string> = {
  SERVICE:                     'var(--dt-blue)',
  HOST:                        'var(--dt-lime)',
  PROCESS_GROUP:               'var(--dt-purple-soft)',
  PROCESS_GROUP_INSTANCE:      'var(--dt-purple-soft)',
  APPLICATION:                 'var(--dt-green)',
  CUSTOM_DEVICE:               'var(--fg-3)',
  CLOUD_APPLICATION:           'var(--dt-blue)',
  CLOUD_APPLICATION_NAMESPACE: 'var(--dt-purple-soft)',
  KUBERNETES_CLUSTER:          'var(--dt-lime)',
};

function getAccent(type: string) {
  return TYPE_ACCENT[type.toUpperCase()] ?? 'var(--dt-blue)';
}

export const RuleInspector: React.FC<RuleInspectorProps> = ({
  edges,
  entities,
  selectedEdgeId,
  onEdgeRemove,
}) => {
  const getEntity = (id: string) => entities.find((e) => e.entityId === id);

  // Determine which edge to show: selectedEdgeId > last edge > null
  const displayEdge = selectedEdgeId
    ? edges.find((e) => e.id === selectedEdgeId) ?? edges[edges.length - 1]
    : edges[edges.length - 1];

  const sourceEntity = displayEdge ? getEntity(displayEdge.sourceEntityId) : null;
  const targetEntity = displayEdge ? getEntity(displayEdge.targetEntityId) : null;

  const isValid = edges.length > 0 && !!sourceEntity && !!targetEntity;

  const ruleOutputLines = displayEdge && sourceEntity && targetEntity
    ? [
        `rule ${sourceEntity.displayName.toLowerCase().replace(/\W+/g, '-')}-${displayEdge.relationshipType.toLowerCase()}-${targetEntity.displayName.toLowerCase().replace(/\W+/g, '-')} {`,
        `  source: ${sourceEntity.type} · ${sourceEntity.displayName}`,
        `  target: ${targetEntity.type} · ${targetEntity.displayName}`,
        `  type: ${displayEdge.relationshipType}`,
        displayEdge.bidirectional ? '  direction: bidirectional' : null,
        `}`,
      ].filter(Boolean) as string[]
    : [];

  return (
    <div style={{
      borderLeft: '1px solid var(--border-soft)',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(19, 24, 38, 0.45)',
      width: 280,
      flexShrink: 0,
    }}>
      {/* Panel head */}
      <div style={{
        padding: '14px 18px 12px',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'flex-start',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--fg-mute)',
            fontWeight: 600,
          }}>
            Rule preview
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginTop: 3 }}>
            {edges.length} relationship{edges.length !== 1 ? 's' : ''}
          </div>
        </div>
        {/* Valid / Invalid pill */}
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 9,
          padding: '3px 8px',
          borderRadius: 999,
          background: isValid ? 'rgba(115, 190, 40, 0.15)' : 'rgba(229, 72, 77, 0.12)',
          color: isValid ? 'var(--dt-green)' : 'var(--danger)',
          border: isValid
            ? '1px solid rgba(115, 190, 40, 0.3)'
            : '1px solid rgba(229, 72, 77, 0.3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 600,
          marginTop: 2,
        }}>
          {isValid ? (
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 12l5 5L20 7"/>
            </svg>
          ) : (
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M12 8v4M12 16h.01"/>
            </svg>
          )}
          {isValid ? 'Valid' : edges.length === 0 ? 'Empty' : 'Invalid'}
        </span>
      </div>

      {/* Panel body */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '14px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>
        {/* Empty state */}
        {edges.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '32px 0',
            gap: 10,
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--fg-mute)" strokeWidth="1.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6M16 13H8M16 17H8"/>
            </svg>
            <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>
              Add entities and draw an edge to see the rule preview
            </div>
          </div>
        )}

        {/* Edge section */}
        {displayEdge && sourceEntity && targetEntity && (
          <>
            {/* Edge summary */}
            <div>
              <div style={{
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--fg-mute)',
                fontWeight: 600,
                marginBottom: 8,
              }}>
                Edge
                {edges.length > 1 && (
                  <span style={{ color: 'var(--dt-blue-soft)', marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>
                    {edges.findIndex((e) => e.id === displayEdge.id) + 1}/{edges.length}
                  </span>
                )}
              </div>
              <div style={{
                background: 'var(--bg-1)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                <div style={{
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  fontSize: 11,
                  color: 'var(--fg-2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  flexWrap: 'wrap',
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{sourceEntity.displayName}</span>
                  <span style={{ color: 'var(--dt-purple-soft)', whiteSpace: 'nowrap' }}>
                    {displayEdge.bidirectional ? '↔' : '→'} {displayEdge.relationshipType} {displayEdge.bidirectional ? '↔' : '→'}
                  </span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{targetEntity.displayName}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--fg-mute)' }}>
                  {displayEdge.bidirectional ? 'Bidirectional' : 'Directed'} · single-instance
                </div>
                {selectedEdgeId === displayEdge.id && (
                  <button
                    onClick={() => onEdgeRemove(displayEdge.id)}
                    style={{
                      marginTop: 2,
                      padding: '4px 10px',
                      borderRadius: 6,
                      border: '1px solid rgba(229, 72, 77, 0.3)',
                      background: 'rgba(229, 72, 77, 0.08)',
                      color: 'var(--danger)',
                      fontSize: 11,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    Remove edge
                  </button>
                )}
              </div>
            </div>

            {/* Source entity */}
            <EntitySection label={`Source · ${sourceEntity.displayName}`} entity={sourceEntity} />

            {/* Target entity */}
            <EntitySection label={`Target · ${targetEntity.displayName}`} entity={targetEntity} />

            {/* Rule output */}
            <div>
              <div style={{
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--fg-mute)',
                fontWeight: 600,
                marginBottom: 8,
              }}>
                Rule output
              </div>
              <div style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '10px 12px',
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                fontSize: 11,
                color: 'var(--fg-2)',
                lineHeight: 1.7,
                overflowX: 'auto',
              }}>
                {ruleOutputLines.map((line, i) => {
                  const trimmed = line.trimStart();
                  const indent = line.length - trimmed.length;
                  let colored: React.ReactNode = line;
                  if (i === 0) {
                    const [keyword, ...rest] = line.split(' ');
                    colored = <><span style={{ color: 'var(--dt-purple-soft)' }}>{keyword}</span>{' '}{rest.join(' ')}</>;
                  } else if (trimmed.startsWith('source') || trimmed.startsWith('target') || trimmed.startsWith('type') || trimmed.startsWith('direction')) {
                    const [key, ...val] = trimmed.split(':');
                    colored = <>{' '.repeat(indent)}<span style={{ color: 'var(--dt-blue-soft)' }}>{key}</span>:{val.join(':')}</>;
                  }
                  return <div key={i}>{colored}</div>;
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const EntitySection: React.FC<{ label: string; entity: CanvasEntity }> = ({ label, entity }) => {
  const accent = TYPE_ACCENT[entity.type.toUpperCase()] ?? 'var(--dt-blue)';
  const visibleTags = entity.tags.filter((t) => t.value).slice(0, 4);

  return (
    <div>
      <div style={{
        fontSize: 10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--fg-mute)',
        fontWeight: 600,
        marginBottom: 8,
      }}>
        {label}
      </div>
      <InspRow label="Type">
        <span style={{ color: accent }}>{entity.type.replace(/_/g, ' ')}</span>
      </InspRow>
      <InspRow label="Entity ID">
        <span style={{ fontSize: 10 }}>{entity.entityId}</span>
      </InspRow>
      {visibleTags.map((tag) => (
        <InspRow key={`${tag.context}:${tag.key}`} label={tag.key}>
          {tag.value}
        </InspRow>
      ))}
      {entity.tags.length > 4 && (
        <div style={{ fontSize: 10, color: 'var(--fg-mute)', marginTop: 4 }}>
          +{entity.tags.length - 4} more tags
        </div>
      )}
    </div>
  );
};

const InspRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: '100px 1fr',
    gap: 8,
    fontSize: 12,
    alignItems: 'baseline',
    marginBottom: 4,
  }}>
    <span style={{ color: 'var(--fg-3)', fontSize: 11 }}>{label}</span>
    <span style={{
      color: 'var(--fg)',
      fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
      fontSize: 11,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  </div>
);
