import React, { useRef, useCallback, useState } from 'react';
import type { CanvasEntity, InteractionMode } from '../types';

interface EntityNodeCardProps {
  entity: CanvasEntity;
  isSelected: boolean;
  isEdgeSource: boolean;
  mode: InteractionMode;
  zoom?: number;
  onSelect: (entityId: string) => void;
  onDragEnd: (entityId: string, x: number, y: number) => void;
  onRemove: (entityId: string) => void;
  onHandleMouseDown?: (entityId: string, side: 'left' | 'right') => void;
}

export const ENTITY_NODE_WIDTH = 220;
export const ENTITY_NODE_HEIGHT = 110; // used for edge midpoint calculation

// Design-spec entity type → accent color map
const TYPE_ACCENT: Record<string, string> = {
  SERVICE:                       'var(--dt-blue)',
  HOST:                          'var(--dt-lime)',
  PROCESS_GROUP:                 'var(--dt-purple-soft)',
  PROCESS_GROUP_INSTANCE:        'var(--dt-purple-soft)',
  APPLICATION:                   'var(--dt-green)',
  CUSTOM_DEVICE:                 'var(--fg-3)',
  CLOUD_APPLICATION:             'var(--dt-blue)',
  CLOUD_APPLICATION_NAMESPACE:   'var(--dt-purple-soft)',
  KUBERNETES_CLUSTER:            'var(--dt-lime)',
  HTTP_CHECK:                    'var(--dt-blue)',
  SYNTHETIC_TEST:                'var(--dt-blue)',
};

function getAccentColor(type: string): string {
  return TYPE_ACCENT[type.toUpperCase()] ?? 'var(--dt-blue)';
}

export const EntityNodeCard: React.FC<EntityNodeCardProps> = ({
  entity,
  isSelected,
  isEdgeSource,
  mode,
  zoom = 1,
  onSelect,
  onDragEnd,
  onRemove,
  onHandleMouseDown,
}) => {
  const dragStart = useRef<{ mouseX: number; mouseY: number; entityX: number; entityY: number } | null>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    isDragging.current = false;
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      entityX: entity.x,
      entityY: entity.y,
    };

    const handleMouseMove = (me: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = me.clientX - dragStart.current.mouseX;
      const dy = me.clientY - dragStart.current.mouseY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) isDragging.current = true;
      if (isDragging.current) {
        onDragEnd(entity.entityId,
          dragStart.current.entityX + dx / zoom,
          dragStart.current.entityY + dy / zoom,
        );
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      dragStart.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [entity, onDragEnd, zoom]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging.current) {
      onSelect(entity.entityId);
    }
  }, [entity.entityId, onSelect]);

  const accent = getAccentColor(entity.type);

  const isActive = isEdgeSource || isSelected;
  const borderColor = isActive ? 'var(--dt-purple)' : 'var(--border)';
  const boxShadow = isSelected
    ? '0 4px 16px rgba(0,0,0,0.5), 0 0 0 3px rgba(111,45,168,0.25)'
    : isEdgeSource
    ? '0 4px 16px rgba(0,0,0,0.5), 0 0 0 3px rgba(139,71,199,0.35)'
    : '0 4px 16px rgba(0,0,0,0.4)';

  // Show a subset of tags as key/value metadata rows
  const metaRows = entity.tags
    .filter((t) => t.value)
    .slice(0, 2);

  return (
    <div
      style={{
        position: 'absolute',
        left: entity.x,
        top: entity.y,
        minWidth: ENTITY_NODE_WIDTH,
        cursor: mode === 'connect' ? 'crosshair' : 'grab',
        userSelect: 'none',
        zIndex: isActive ? 10 : 5,
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <div
        style={{
          background: 'var(--bg-1)',
          border: `1.5px solid ${borderColor}`,
          borderRadius: 10,
          padding: '14px 16px 12px 19px',
          boxShadow,
          position: 'relative',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        {/* Left accent rail */}
        <span style={{
          position: 'absolute',
          left: 0,
          top: 14,
          bottom: 14,
          width: 3,
          background: accent,
          borderRadius: '0 2px 2px 0',
        }} />

        {/* Head row: name + remove button */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--fg)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {entity.displayName}
            </div>
            {/* Outlined type pill */}
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 9,
              padding: '2px 7px',
              borderRadius: 999,
              background: 'transparent',
              border: `1px solid ${accent}60`,
              color: accent,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 600,
              marginTop: 4,
              whiteSpace: 'nowrap',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent, display: 'inline-block' }} />
              {entity.type.replace(/_/g, ' ')}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(entity.entityId); }}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--fg-mute)',
              cursor: 'pointer',
              fontSize: 16,
              padding: '0 0 0 4px',
              lineHeight: 1,
              flexShrink: 0,
            }}
            title="Remove from canvas"
          >
            ×
          </button>
        </div>

        {/* Metadata rows (tags as key/value) */}
        {metaRows.map((tag) => (
          <div
            key={`${tag.context}:${tag.key}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              fontSize: 10,
              marginTop: 6,
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              gap: 8,
            }}
          >
            <span style={{ color: 'var(--fg-3)', flexShrink: 0 }}>{tag.key}</span>
            <span style={{
              color: 'var(--fg-2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {tag.value}
            </span>
          </div>
        ))}
        {entity.tags.length > 2 && (
          <div style={{ fontSize: 10, color: 'var(--fg-mute)', marginTop: 4, fontFamily: "'IBM Plex Mono', monospace" }}>
            +{entity.tags.length - 2} more
          </div>
        )}

        {/* Connection handles — visible in Connect mode */}
        {mode === 'connect' && (
          <>
            <span
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onHandleMouseDown?.(entity.entityId, 'left'); }}
              style={{
                position: 'absolute',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'var(--bg)',
                border: '2px solid var(--dt-purple)',
                left: -7,
                top: 'calc(50% - 7px)',
                pointerEvents: 'auto',
                cursor: 'crosshair',
                zIndex: 20,
              }}
            />
            <span
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onHandleMouseDown?.(entity.entityId, 'right'); }}
              style={{
                position: 'absolute',
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'var(--bg)',
                border: '2px solid var(--dt-purple)',
                right: -7,
                top: 'calc(50% - 7px)',
                pointerEvents: 'auto',
                cursor: 'crosshair',
                zIndex: 20,
              }}
            />
          </>
        )}
      </div>
    </div>
  );
};

