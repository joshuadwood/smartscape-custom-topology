import React, { useCallback, useRef, useState, useEffect } from 'react';
import { Text } from '@dynatrace/strato-components/typography';
import Colors from '@dynatrace/strato-design-tokens/colors';
import { EntityNodeCard, ENTITY_NODE_WIDTH, ENTITY_NODE_HEIGHT } from './EntityNodeCard';
import type { CanvasEntity, CanvasEdge, InteractionMode } from '../types';

const CANVAS_W = 2400;
const CANVAS_H = 1600;

interface TopologyCanvasProps {
  entities: CanvasEntity[];
  edges: CanvasEdge[];
  mode: InteractionMode;
  edgeSourceId: string | null;
  onEntityMove: (id: string, x: number, y: number) => void;
  onEntitySelect: (id: string) => void;
  onEntityRemove: (id: string) => void;
  onCanvasClick: () => void;
  onEdgeRemove: (edgeId: string) => void;
  selectedEntityId: string | null;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const TopologyCanvas: React.FC<TopologyCanvasProps> = ({
  entities,
  edges,
  mode,
  edgeSourceId,
  onEntityMove,
  onEntitySelect,
  onEntityRemove,
  onCanvasClick,
  onEdgeRemove,
  selectedEntityId,
  onContextMenu,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const getEntityCenter = useCallback((entityId: string) => {
    const e = entities.find((ent) => ent.entityId === entityId);
    if (!e) return { x: 0, y: 0 };
    return { x: e.x + ENTITY_NODE_WIDTH / 2, y: e.y + ENTITY_NODE_HEIGHT / 2 };
  }, [entities]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const scrollTop = containerRef.current.scrollTop;
    setMousePos({
      x: e.clientX - rect.left + scrollLeft,
      y: e.clientY - rect.top + scrollTop,
    });
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement) === containerRef.current) {
      onCanvasClick();
    }
  }, [onCanvasClick]);

  const isEmpty = entities.length === 0;

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: 'auto',
        position: 'relative',
        background: Colors.Background.Surface.Backdrop,
        cursor: mode === 'pan' ? 'grab' : 'default',
      }}
      onMouseMove={handleMouseMove}
      onClick={handleCanvasClick}
      onContextMenu={onContextMenu}
    >
      {/* Inner canvas */}
      <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H }}>
        {/* Grid background */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke={Colors.Border.Neutral.Default} strokeWidth="0.5" />
            </pattern>
            {/* Arrowhead for directed edges */}
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={Colors.Charts.Categorical.Color01.Default} />
            </marker>
            <marker id="arrowhead-preview" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={Colors.Text.Neutral.Subdued} />
            </marker>
            <marker id="arrowhead-bidir" markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
              <polygon points="0 0, 10 3.5, 0 7" fill={Colors.Charts.Categorical.Color02.Default} />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Existing edges */}
          {edges.map((edge) => (
            <EdgeLine
              key={edge.id}
              edge={edge}
              getCenter={getEntityCenter}
              onRemove={onEdgeRemove}
              entities={entities}
            />
          ))}

          {/* Preview line while connecting */}
          {mode === 'connect' && edgeSourceId && (() => {
            const src = getEntityCenter(edgeSourceId);
            return (
              <line
                x1={src.x} y1={src.y}
                x2={mousePos.x} y2={mousePos.y}
                stroke={Colors.Text.Neutral.Subdued}
                strokeWidth={2}
                strokeDasharray="6 3"
                markerEnd="url(#arrowhead-preview)"
                style={{ pointerEvents: 'none' }}
              />
            );
          })()}
        </svg>

        {/* Entity nodes */}
        {entities.map((entity) => (
          <EntityNodeCard
            key={entity.entityId}
            entity={entity}
            isSelected={selectedEntityId === entity.entityId}
            isEdgeSource={edgeSourceId === entity.entityId}
            mode={mode}
            onSelect={onEntitySelect}
            onDragEnd={onEntityMove}
            onRemove={onEntityRemove}
          />
        ))}

        {/* Empty state */}
        {isEmpty && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ textAlign: 'center', opacity: 0.7 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🗺️</div>
              <Text color="secondary" style={{ fontSize: 16, display: 'block' }}>
                Click entities in the browser to add them here
              </Text>
              <Text color="secondary" style={{ fontSize: 13, marginTop: 8, display: 'block' }}>
                Then use <strong>Connect</strong> mode to draw edges between them
              </Text>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface EdgeLineProps {
  edge: CanvasEdge;
  getCenter: (id: string) => { x: number; y: number };
  onRemove: (id: string) => void;
  entities: CanvasEntity[];
}

const EdgeLine: React.FC<EdgeLineProps> = ({ edge, getCenter, onRemove, entities }) => {
  const src = getCenter(edge.sourceEntityId);
  const tgt = getCenter(edge.targetEntityId);

  if (!src || !tgt) return null;

  const color = edge.bidirectional
    ? Colors.Charts.Categorical.Color02.Default
    : Colors.Charts.Categorical.Color01.Default;

  const midX = (src.x + tgt.x) / 2;
  const midY = (src.y + tgt.y) / 2;

  // Slightly offset line for bidirectional to avoid overlap
  const dx = tgt.x - src.x;
  const dy = tgt.y - src.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const offset = edge.bidirectional ? 5 : 0;
  const nx = (-dy / len) * offset;
  const ny = (dx / len) * offset;

  const srcEntity = entities.find((e) => e.entityId === edge.sourceEntityId);
  const tgtEntity = entities.find((e) => e.entityId === edge.targetEntityId);
  const ariaLabel = `${edge.relationshipType} edge from ${srcEntity?.displayName ?? edge.sourceEntityId} to ${tgtEntity?.displayName ?? edge.targetEntityId}${edge.bidirectional ? ' (bidirectional)' : ''}. Click to remove.`;

  return (
    <g role="button" aria-label={ariaLabel} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRemove(edge.id); } }}>
      <line
        x1={src.x + nx} y1={src.y + ny}
        x2={tgt.x + nx} y2={tgt.y + ny}
        stroke={color}
        strokeWidth={2}
        markerEnd={edge.bidirectional ? 'url(#arrowhead-bidir)' : 'url(#arrowhead)'}
        markerStart={edge.bidirectional ? 'url(#arrowhead-bidir)' : undefined}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); onRemove(edge.id); }}
      />
      {/* Relationship type label */}
      <text
        x={midX + nx} y={midY + ny - 6}
        textAnchor="middle"
        fontSize={10}
        fill={color}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {edge.relationshipType}
      </text>
      {/* Invisible wider hit area for easier clicking */}
      <line
        x1={src.x + nx} y1={src.y + ny}
        x2={tgt.x + nx} y2={tgt.y + ny}
        stroke="transparent"
        strokeWidth={12}
        style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
        onClick={(e) => { e.stopPropagation(); onRemove(edge.id); }}
      />
    </g>
  );
};
