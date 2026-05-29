import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EntityNodeCard, ENTITY_NODE_WIDTH, ENTITY_NODE_HEIGHT } from './EntityNodeCard';
import type { CanvasEntity, CanvasEdge, InteractionMode } from '../types';

const CANVAS_W = 2400;
const CANVAS_H = 1600;

interface TopologyCanvasProps {
  entities: CanvasEntity[];
  edges: CanvasEdge[];
  mode: InteractionMode;
  edgeSourceId: string | null;
  selectedEdgeId: string | null;
  onEntityMove: (id: string, x: number, y: number) => void;
  onEntitySelect: (id: string) => void;
  onEntityRemove: (id: string) => void;
  onCanvasClick: () => void;
  onEdgeSelect: (edgeId: string) => void;
  onEdgeRemove: (edgeId: string) => void;
  selectedEntityId: string | null;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const TopologyCanvas: React.FC<TopologyCanvasProps> = ({
  entities,
  edges,
  mode,
  edgeSourceId,
  selectedEdgeId,
  onEntityMove,
  onEntitySelect,
  onEntityRemove,
  onCanvasClick,
  onEdgeSelect,
  onEdgeRemove,
  selectedEntityId,
  onContextMenu,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1.0);
  const [edgeSourceHandle, setEdgeSourceHandle] = useState<'left' | 'right' | null>(null);

  // Reset which handle was used as source whenever the source entity clears
  useEffect(() => {
    if (!edgeSourceId) setEdgeSourceHandle(null);
  }, [edgeSourceId]);

  const getEntityCenter = useCallback((entityId: string) => {
    const e = entities.find((ent) => ent.entityId === entityId);
    if (!e) return { x: 0, y: 0 };
    return { x: e.x + ENTITY_NODE_WIDTH / 2, y: e.y + ENTITY_NODE_HEIGHT / 2 };
  }, [entities]);

  const getHandlePos = useCallback((entityId: string, side: 'left' | 'right') => {
    const e = entities.find((ent) => ent.entityId === entityId);
    if (!e) return { x: 0, y: 0 };
    return side === 'left'
      ? { x: e.x, y: e.y + ENTITY_NODE_HEIGHT / 2 }
      : { x: e.x + ENTITY_NODE_WIDTH, y: e.y + ENTITY_NODE_HEIGHT / 2 };
  }, [entities]);

  // Auto-routes an edge from the best-facing handle of each entity
  const getAutoHandles = useCallback((srcId: string, tgtId: string) => {
    const src = entities.find((e) => e.entityId === srcId);
    const tgt = entities.find((e) => e.entityId === tgtId);
    if (!src || !tgt) return { srcPt: { x: 0, y: 0 }, tgtPt: { x: 0, y: 0 } };
    const srcCenter = src.x + ENTITY_NODE_WIDTH / 2;
    const tgtCenter = tgt.x + ENTITY_NODE_WIDTH / 2;
    const srcSide: 'left' | 'right' = srcCenter <= tgtCenter ? 'right' : 'left';
    const tgtSide: 'left' | 'right' = srcCenter <= tgtCenter ? 'left' : 'right';
    return {
      srcPt: getHandlePos(srcId, srcSide),
      tgtPt: getHandlePos(tgtId, tgtSide),
    };
  }, [entities, getHandlePos]);

  // Finds the nearest handle within snap radius for the preview line
  const getSnapTarget = useCallback((mx: number, my: number) => {
    const SNAP_RADIUS = 50;
    let best: { dist: number; x: number; y: number; entityId: string } | null = null;
    for (const e of entities) {
      if (e.entityId === edgeSourceId) continue;
      for (const side of ['left', 'right'] as const) {
        const pt = getHandlePos(e.entityId, side);
        const dist = Math.hypot(pt.x - mx, pt.y - my);
        if (dist < SNAP_RADIUS && (!best || dist < best.dist)) {
          best = { dist, x: pt.x, y: pt.y, entityId: e.entityId };
        }
      }
    }
    return best;
  }, [entities, edgeSourceId, getHandlePos]);

  const handleHandleMouseDown = useCallback((entityId: string, side: 'left' | 'right') => {
    setEdgeSourceHandle(side);
    onEntitySelect(entityId);
  }, [onEntitySelect]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setMousePos({
      x: (e.clientX - rect.left + containerRef.current.scrollLeft) / zoom,
      y: (e.clientY - rect.top + containerRef.current.scrollTop) / zoom,
    });
  }, [zoom]);

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement) === containerRef.current) {
      onCanvasClick();
    }
  }, [onCanvasClick]);

  const handleZoom = useCallback((delta: number) => {
    setZoom((z) => Math.min(2, Math.max(0.25, z + delta)));
  }, []);

  const isEmpty = entities.length === 0;

  // Minimap scale factors
  const minimapW = 148;
  const minimapH = 82;
  const mmScaleX = minimapW / CANVAS_W;
  const mmScaleY = minimapH / CANVAS_H;

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflow: 'auto',
        position: 'relative',
        background: 'var(--bg)',
        backgroundImage: 'radial-gradient(circle at center, rgba(170, 188, 226, 0.08) 1px, transparent 1px)',
        backgroundSize: '20px 20px',
        cursor: mode === 'connect' ? 'crosshair' : 'default',
      }}
      onMouseMove={handleMouseMove}
      onClick={handleCanvasClick}
      onContextMenu={onContextMenu}
    >
      {/* Scroll-sizer wrapper that accounts for zoom */}
      <div style={{ width: CANVAS_W * zoom, height: CANVAS_H * zoom, position: 'relative' }}>
        {/* Inner canvas — CSS-transformed for zoom */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: CANVAS_W,
          height: CANVAS_H,
          transformOrigin: '0 0',
          transform: `scale(${zoom})`,
        }}>
          {/* SVG layer for edges */}
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <marker id="arrow-fwd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0L10 5L0 10z" fill="var(--dt-purple-soft)" />
              </marker>
              <marker id="arrow-rev" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M10 0L0 5L10 10z" fill="var(--dt-purple-soft)" />
              </marker>
              <marker id="arrow-fwd-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0L10 5L0 10z" fill="var(--dt-lime)" />
              </marker>
              <marker id="arrow-rev-sel" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M10 0L0 5L10 10z" fill="var(--dt-lime)" />
              </marker>
              <marker id="arrow-preview" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M0 0L10 5L0 10z" fill="var(--fg-3)" />
              </marker>
            </defs>

            {/* Existing edges */}
            {edges.map((edge) => {
              const { srcPt, tgtPt } = getAutoHandles(edge.sourceEntityId, edge.targetEntityId);
              const isSelected = selectedEdgeId === edge.id;
              const color = isSelected ? 'var(--dt-lime)' : 'var(--dt-purple-soft)';
              const arrowFwd = isSelected ? 'url(#arrow-fwd-sel)' : 'url(#arrow-fwd)';
              const arrowRev = isSelected ? 'url(#arrow-rev-sel)' : 'url(#arrow-rev)';

              return (
                <g key={edge.id}>
                  {/* Hit area */}
                  <line
                    x1={srcPt.x} y1={srcPt.y} x2={tgtPt.x} y2={tgtPt.y}
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); onEdgeSelect(edge.id); }}
                  />
                  {/* Visible edge line */}
                  <line
                    x1={srcPt.x} y1={srcPt.y} x2={tgtPt.x} y2={tgtPt.y}
                    stroke={color}
                    strokeWidth={1.8}
                    markerEnd={arrowFwd}
                    markerStart={edge.bidirectional ? arrowRev : undefined}
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              );
            })}

            {/* Preview line while connecting */}
            {mode === 'connect' && edgeSourceId && (() => {
              const srcEntity = entities.find((ent) => ent.entityId === edgeSourceId);
              const srcPt = edgeSourceHandle
                ? getHandlePos(edgeSourceId, edgeSourceHandle)
                : srcEntity
                  ? getHandlePos(edgeSourceId, mousePos.x >= srcEntity.x + ENTITY_NODE_WIDTH / 2 ? 'right' : 'left')
                  : { x: 0, y: 0 };
              const snapTgt = getSnapTarget(mousePos.x, mousePos.y);
              const endPt = snapTgt ?? mousePos;
              return (
                <>
                  <line
                    x1={srcPt.x} y1={srcPt.y}
                    x2={endPt.x} y2={endPt.y}
                    stroke="var(--fg-3)"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                    markerEnd="url(#arrow-preview)"
                    style={{ pointerEvents: 'none' }}
                  />
                  {snapTgt && (
                    <circle
                      cx={snapTgt.x} cy={snapTgt.y} r={8}
                      fill="none"
                      stroke="var(--dt-purple)"
                      strokeWidth={2}
                      opacity={0.8}
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                </>
              );
            })()}
          </svg>

          {/* Edge pill labels */}
          {edges.map((edge) => {
            const { srcPt, tgtPt } = getAutoHandles(edge.sourceEntityId, edge.targetEntityId);
            const midX = (srcPt.x + tgtPt.x) / 2;
            const midY = (srcPt.y + tgtPt.y) / 2;
            const isSelected = selectedEdgeId === edge.id;
            const label = `${edge.relationshipType} ${edge.bidirectional ? '↔' : '→'}`;
            return (
              <div
                key={`pill-${edge.id}`}
                onClick={(e) => { e.stopPropagation(); onEdgeSelect(edge.id); }}
                style={{
                  position: 'absolute',
                  left: midX,
                  top: midY - 22,
                  transform: 'translateX(-50%)',
                  padding: '3px 10px',
                  background: 'var(--bg-1)',
                  border: isSelected
                    ? '1px solid rgba(190, 223, 42, 0.5)'
                    : '1px solid rgba(139, 71, 199, 0.4)',
                  borderRadius: 999,
                  fontSize: 10,
                  fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                  color: isSelected ? 'var(--dt-lime)' : 'var(--dt-purple-soft)',
                  letterSpacing: '0.08em',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  zIndex: 3,
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  userSelect: 'none',
                }}
              >
                {label}
              </div>
            );
          })}

          {/* Entity nodes */}
          {entities.map((entity) => (
            <EntityNodeCard
              key={entity.entityId}
              entity={entity}
              isSelected={selectedEntityId === entity.entityId}
              isEdgeSource={edgeSourceId === entity.entityId}
              mode={mode}
              zoom={zoom}
              onSelect={onEntitySelect}
              onDragEnd={onEntityMove}
              onRemove={onEntityRemove}
              onHandleMouseDown={handleHandleMouseDown}
            />
          ))}

          {/* Empty state */}
          {isEmpty && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{ textAlign: 'center' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--fg-mute)" strokeWidth="1">
                  <circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><circle cx="18" cy="6" r="3"/>
                  <path d="M9 6h6M6 9v6a3 3 0 0 0 3 3h6"/>
                </svg>
                <div style={{ color: 'var(--fg-3)', fontSize: 15, marginTop: 12, fontWeight: 500 }}>
                  Add entities from the browser
                </div>
                <div style={{ color: 'var(--fg-mute)', fontSize: 12, marginTop: 6 }}>
                  Then switch to Connect mode to draw edges between them
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Floating chrome (not affected by zoom) ── */}

      {/* Tool palette — top-left */}
      <div style={{
        position: 'absolute',
        left: 16,
        top: 16,
        display: 'flex',
        gap: 4,
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 4,
      }}>
        <button
          title="Pan mode — drag to scroll"
          style={{
            width: 30,
            height: 30,
            borderRadius: 5,
            border: 'none',
            background: 'transparent',
            color: 'var(--fg-3)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 9l-3 3 3 3M19 9l3 3-3 3M9 5l3-3 3 3M9 19l3 3 3-3"/>
          </svg>
        </button>
      </div>

      {/* Mode badge — top-right */}
      <div style={{
        position: 'absolute',
        right: 16,
        top: 16,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '5px 12px',
        borderRadius: 999,
        background: mode === 'connect'
          ? 'rgba(111, 45, 168, 0.14)'
          : 'rgba(26, 32, 51, 0.8)',
        color: mode === 'connect' ? 'var(--dt-purple-soft)' : 'var(--fg-3)',
        border: mode === 'connect'
          ? '1px solid rgba(111, 45, 168, 0.35)'
          : '1px solid var(--border)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        backdropFilter: 'blur(4px)',
        pointerEvents: 'none',
      }}>
        {mode === 'connect' ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M13 6l6 6-6 6"/>
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 2l8 20 2-8 8-2z"/>
          </svg>
        )}
        {mode === 'connect' ? 'Connect mode' : 'Select mode'}
      </div>

      {/* Zoom controls — bottom-right */}
      <div style={{
        position: 'absolute',
        right: 16,
        bottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 4,
      }}>
        <button
          onClick={() => handleZoom(0.1)}
          title="Zoom in"
          style={{
            width: 28,
            height: 28,
            borderRadius: 5,
            border: 'none',
            background: 'transparent',
            color: 'var(--fg-2)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
        <div style={{
          textAlign: 'center',
          fontSize: 10,
          color: 'var(--fg-mute)',
          fontFamily: "'IBM Plex Mono', monospace",
          padding: '2px 0',
        }}>
          {Math.round(zoom * 100)}%
        </div>
        <button
          onClick={() => handleZoom(-0.1)}
          title="Zoom out"
          style={{
            width: 28,
            height: 28,
            borderRadius: 5,
            border: 'none',
            background: 'transparent',
            color: 'var(--fg-2)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14"/>
          </svg>
        </button>
      </div>

      {/* Minimap — bottom-left */}
      <div style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        width: 160,
        height: 100,
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '6px 6px 4px',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontSize: 9,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--fg-mute)',
          fontFamily: "'IBM Plex Mono', monospace",
          marginBottom: 3,
        }}>
          Overview
        </div>
        <div style={{ position: 'relative', width: '100%', height: 'calc(100% - 16px)', background: 'var(--bg)', borderRadius: 4 }}>
          {/* Node rectangles */}
          {entities.map((e) => (
            <span key={e.entityId} style={{
              position: 'absolute',
              left: e.x * mmScaleX,
              top: e.y * mmScaleY,
              width: ENTITY_NODE_WIDTH * mmScaleX,
              height: ENTITY_NODE_HEIGHT * mmScaleY,
              background: 'var(--dt-blue)',
              borderRadius: 1,
              opacity: 0.7,
            }} />
          ))}
          {/* Edge lines */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {edges.map((edge) => {
              const src = getEntityCenter(edge.sourceEntityId);
              const tgt = getEntityCenter(edge.targetEntityId);
              return (
                <line
                  key={edge.id}
                  x1={src.x * mmScaleX} y1={src.y * mmScaleY}
                  x2={tgt.x * mmScaleX} y2={tgt.y * mmScaleY}
                  stroke="var(--dt-purple-soft)"
                  strokeWidth={1}
                  opacity={0.8}
                />
              );
            })}
          </svg>
          {/* Viewport rect */}
          {containerRef.current && (
            <span style={{
              position: 'absolute',
              left: (containerRef.current.scrollLeft / zoom) * mmScaleX,
              top: (containerRef.current.scrollTop / zoom) * mmScaleY,
              width: (containerRef.current.clientWidth / zoom) * mmScaleX,
              height: (containerRef.current.clientHeight / zoom) * mmScaleY,
              border: '1px solid var(--dt-lime)',
              borderRadius: 2,
              opacity: 0.6,
            }} />
          )}
        </div>
      </div>
    </div>
  );
};


