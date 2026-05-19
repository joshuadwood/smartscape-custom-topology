import React, { useState, useMemo, useCallback, useRef } from 'react';
import { Flex } from '@dynatrace/strato-components/layouts';
import { Heading, Text } from '@dynatrace/strato-components/typography';
import { TextInput } from '@dynatrace/strato-components-preview/forms';
import { ProgressCircle } from '@dynatrace/strato-components/content';
import { Surface } from '@dynatrace/strato-components/layouts';
import { Container } from '@dynatrace/strato-components/layouts';
import Colors from '@dynatrace/strato-design-tokens/colors';
import { useEntities } from '../hooks/useEntities';
import { useCustomEntityTypes } from '../hooks/useCustomEntityTypes';
import type { DynatraceEntity } from '../types';
import { ENTITY_TYPES } from '../types';

interface EntityBrowserProps {
  onAddEntity: (entity: DynatraceEntity) => void;
  addedEntityIds: Set<string>;
}

export const EntityBrowser: React.FC<EntityBrowserProps> = ({ onAddEntity, addedEntityIds }) => {
  const [selectedType, setSelectedType] = useState<string>(ENTITY_TYPES[0].id);
  const [search, setSearch] = useState('');
  const { entities, isLoading, error } = useEntities(selectedType, search);
  const { customTypes, isLoading: customTypesLoading } = useCustomEntityTypes();
  const [typePanelHeight, setTypePanelHeight] = useState(120);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startY.current = e.clientY;
    startH.current = typePanelHeight;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta = ev.clientY - startY.current;
      setTypePanelHeight(Math.max(60, Math.min(400, startH.current + delta)));
    };
    const onUp = () => {
      dragging.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [typePanelHeight]);

  const allTypes = useMemo(() => {
    const builtIn = ENTITY_TYPES.map((et) => ({ id: et.id, label: et.label }));
    const custom = customTypes.map((ct) => ({ id: ct.id, label: ct.label }));
    return [...builtIn, ...custom];
  }, [customTypes]);

  return (
    <Flex flexDirection="column" style={{ width: 260, borderRight: `1px solid ${Colors.Border.Neutral.Default}`, height: '100%', overflow: 'hidden' }}>
      <Container paddingBottom={0}>
        <Heading level={5}>Entity Browser</Heading>
        <TextInput
          placeholder="Search entities..."
          value={search}
          onChange={setSearch}
          style={{ marginTop: 8 }}
        />
      </Container>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 8px',
        flexShrink: 0,
        maxHeight: typePanelHeight, overflowY: 'auto',
      }}>
        {allTypes.map((et) => {
          const active = selectedType === et.id;
          return (
            <button
              key={et.id}
              onClick={() => { setSelectedType(et.id); setSearch(''); }}
              style={{
                padding: '4px 10px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                border: `1px solid ${active ? Colors.Border.Neutral.Accent : Colors.Border.Neutral.Default}`,
                background: active ? Colors.Background.Container.Neutral.Accent : 'transparent',
                color: active ? Colors.Text.Neutral.OnAccent.Default : Colors.Text.Neutral.Default,
                fontWeight: active ? 600 : 400,
              }}
            >
              {et.label}
            </button>
          );
        })}
        {customTypesLoading && <ProgressCircle size="small" />}
      </div>

      {/* Draggable resize handle */}
      <div
        onMouseDown={handleDragStart}
        style={{
          height: 6,
          cursor: 'row-resize',
          background: Colors.Border.Neutral.Default,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ width: 32, height: 2, borderRadius: 1, background: Colors.Text.Neutral.Subdued }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {isLoading && (
          <Flex justifyContent="center" padding={16}>
            <ProgressCircle size="small" />
          </Flex>
        )}
        {error && (
          <Container>
            <Text color="critical">Failed to load entities: {error.message}</Text>
          </Container>
        )}
        {!isLoading && !error && entities.length === 0 && (
          <Container>
            <Text color="secondary">No entities found.</Text>
          </Container>
        )}
        {entities.map((entity) => {
          const isAdded = addedEntityIds.has(entity.entityId);
          return (
            <EntityListItem
              key={entity.entityId}
              entity={entity}
              isAdded={isAdded}
              onAdd={() => onAddEntity(entity)}
            />
          );
        })}
      </div>
    </Flex>
  );
};

interface EntityListItemProps {
  entity: DynatraceEntity;
  isAdded: boolean;
  onAdd: () => void;
}

const EntityListItem: React.FC<EntityListItemProps> = ({ entity, isAdded, onAdd }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <Surface
      style={{
        margin: '2px 8px',
        padding: '8px 12px',
        cursor: isAdded ? 'default' : 'pointer',
        opacity: isAdded ? 0.6 : 1,
        backgroundColor: hovered && !isAdded ? Colors.Background.Surface.Backdrop : 'transparent',
        borderRadius: 4,
        transition: 'background-color 0.15s',
      }}
      onClick={() => !isAdded && onAdd()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Text
        style={{ fontWeight: 500, fontSize: 13, display: 'block', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
          textDecoration: isAdded ? 'line-through' : 'none' }}
      >
        {entity.displayName}
      </Text>
      <Text color="secondary" style={{ fontSize: 12 }}>
        {entity.type}
        {isAdded && ' · Added'}
      </Text>
    </Surface>
  );
};
