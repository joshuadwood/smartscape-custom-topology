import React, { useRef, useCallback, useState } from 'react';
import { Flex } from '@dynatrace/strato-components/layouts';
import { Text } from '@dynatrace/strato-components/typography';
import Colors from '@dynatrace/strato-design-tokens/colors';
import BoxShadows from '@dynatrace/strato-design-tokens/box-shadows';
import type { CanvasEntity, InteractionMode } from '../types';

interface EntityNodeCardProps {
  entity: CanvasEntity;
  isSelected: boolean;
  isEdgeSource: boolean;
  mode: InteractionMode;
  onSelect: (entityId: string) => void;
  onDragEnd: (entityId: string, x: number, y: number) => void;
  onRemove: (entityId: string) => void;
}

export const ENTITY_NODE_WIDTH = 220;
export const ENTITY_NODE_HEIGHT = 90;

export const EntityNodeCard: React.FC<EntityNodeCardProps> = ({
  entity,
  isSelected,
  isEdgeSource,
  mode,
  onSelect,
  onDragEnd,
  onRemove,
}) => {
  const dragStart = useRef<{ mouseX: number; mouseY: number; entityX: number; entityY: number } | null>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Allow dragging in any mode
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
        onDragEnd(entity.entityId, dragStart.current.entityX + dx, dragStart.current.entityY + dy);
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      dragStart.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [mode, entity, onDragEnd]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDragging.current) {
      onSelect(entity.entityId);
    }
  }, [entity.entityId, onSelect]);

  const borderColor = isEdgeSource
    ? Colors.Charts.Categorical.Color01.Default
    : isSelected
    ? Colors.Border.Neutral.Accent
    : Colors.Border.Neutral.Default;

  const bgColor = isEdgeSource
    ? Colors.Background.Container.Primary.Default
    : isSelected
    ? Colors.Background.Surface.Default
    : Colors.Background.Surface.Default;

  return (
    <div
      style={{
        position: 'absolute',
        left: entity.x,
        top: entity.y,
        width: ENTITY_NODE_WIDTH,
        height: ENTITY_NODE_HEIGHT,
        cursor: mode === 'select' ? 'grab' : 'crosshair',
        userSelect: 'none',
        zIndex: isSelected || isEdgeSource ? 10 : 5,
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <div
        style={{
          background: bgColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 8,
          padding: '8px 12px',
          height: '100%',
          boxSizing: 'border-box',
          boxShadow: isSelected ? BoxShadows.Surface.Raised.Hover : BoxShadows.Surface.Raised.Rest,
          transition: 'border-color 0.15s, box-shadow 0.15s',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Remove button */}
        <RemoveButton onClick={(e) => { e.stopPropagation(); onRemove(entity.entityId); }} />

        <Text style={{ fontWeight: 600, fontSize: 13, display: 'block', paddingRight: 20,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {entity.displayName}
        </Text>
        <EntityTypeChip type={entity.type} />

        {entity.tags.length > 0 && (
          <Flex flexWrap="wrap" gap={2} style={{ marginTop: 4 }}>
            {entity.tags.slice(0, 3).map((tag) => (
              <span
                key={`${tag.context}:${tag.key}:${tag.value ?? ''}`}
                style={{
                  fontSize: 11, padding: '1px 5px', borderRadius: 10,
                  background: Colors.Background.Surface.Backdrop,
                  color: Colors.Text.Neutral.Default, maxWidth: 80,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {tag.value ? `${tag.key}:${tag.value}` : tag.key}
              </span>
            ))}
            {entity.tags.length > 3 && (
              <span style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued }}>
                +{entity.tags.length - 3}
              </span>
            )}
          </Flex>
        )}
      </div>
    </div>
  );
};

const TYPE_COLORS: Record<string, string> = {
  SERVICE: Colors.Charts.Categorical.Color01.Default,
  HOST: Colors.Charts.Categorical.Color02.Default,
  PROCESS_GROUP: Colors.Charts.Categorical.Color03.Default,
  APPLICATION: Colors.Charts.Categorical.Color04.Default,
  CUSTOM_DEVICE: Colors.Charts.Categorical.Color05.Default,
};

const RemoveButton: React.FC<{ onClick: (e: React.MouseEvent) => void }> = ({ onClick }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{
        position: 'absolute', top: 4, right: 4,
        width: 18, height: 18, borderRadius: '50%',
        background: hovered ? Colors.Background.Container.Critical.Default : Colors.Background.Surface.Backdrop,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', fontSize: 12,
        color: hovered ? Colors.Text.Critical.Default : Colors.Text.Neutral.Default,
        lineHeight: 1,
        transition: 'all 0.15s',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title="Remove from canvas"
    >
      ×
    </div>
  );
};

const EntityTypeChip: React.FC<{ type: string }> = ({ type }) => {
  const color = TYPE_COLORS[type] ?? Colors.Text.Neutral.Subdued;
  const label = type.replace(/_/g, ' ');
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, padding: '1px 6px',
      borderRadius: 10, background: color,
      color: Colors.Text.Neutral.OnAccent.Default,
      marginTop: 3, fontWeight: 500,
    }}>
      {label}
    </span>
  );
};
