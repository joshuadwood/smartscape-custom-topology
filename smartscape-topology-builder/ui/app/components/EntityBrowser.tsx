import React, { useState, useMemo, useCallback } from 'react';
import { ProgressCircle } from '@dynatrace/strato-components/content';
import { useEntities } from '../hooks/useEntities';
import { useCustomEntityTypes } from '../hooks/useCustomEntityTypes';
import type { DynatraceEntity, CanvasEntity } from '../types';
import { ENTITY_TYPES } from '../types';

interface EntityBrowserProps {
  onAddEntity: (entity: DynatraceEntity) => void;
  addedEntityIds: Set<string>;
  canvasEntities: CanvasEntity[];
}

// Entity type → accent color
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
  HTTP_CHECK:                  'var(--dt-blue)',
  SYNTHETIC_TEST:              'var(--dt-blue)',
};

function getAccent(dqlType: string) {
  return TYPE_ACCENT[dqlType.toUpperCase()] ?? 'var(--dt-blue)';
}

export const EntityBrowser: React.FC<EntityBrowserProps> = ({
  onAddEntity,
  addedEntityIds,
  canvasEntities,
}) => {
  const [selectedTypeId, setSelectedTypeId] = useState<string>(ENTITY_TYPES[0].id);
  const [search, setSearch] = useState('');
  const { entities, isLoading, error } = useEntities(selectedTypeId, search);
  const { customTypes, isLoading: customTypesLoading } = useCustomEntityTypes();

  const allTypes = useMemo(() => {
    const builtIn = ENTITY_TYPES.map((et) => ({ id: et.id, label: et.label, dqlType: et.dqlType }));
    const custom = customTypes.map((ct) => ({ id: ct.id, label: ct.label, dqlType: ct.id.split(':')[1]?.toUpperCase() ?? 'CUSTOM' }));
    return [...builtIn, ...custom];
  }, [customTypes]);

  const selectedType = allTypes.find((t) => t.id === selectedTypeId);

  const availableEntities = entities.filter((e) => !addedEntityIds.has(e.entityId));
  const totalShown = entities.length;

  const handleTypeSelect = useCallback((typeId: string) => {
    setSelectedTypeId(typeId);
    setSearch('');
  }, []);

  return (
    <div style={{
      width: 280,
      flexShrink: 0,
      borderRight: '1px solid var(--border-soft)',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(19, 24, 38, 0.45)',
      overflow: 'hidden',
    }}>
      {/* Panel head */}
      <div style={{
        padding: '14px 18px 10px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
          Entity browser
        </span>
        <span style={{
          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          fontSize: 11,
          color: 'var(--fg-mute)',
          marginLeft: 'auto',
        }}>
          {totalShown}
        </span>
      </div>

      {/* Search */}
      <div style={{
        margin: '0 18px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
        flexShrink: 0,
      }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--fg-3)" strokeWidth="2">
          <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search entities…"
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--fg)',
            fontSize: 13,
            fontFamily: 'inherit',
            flex: 1,
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{ background: 'none', border: 'none', color: 'var(--fg-mute)', cursor: 'pointer', padding: 0, fontSize: 14 }}
          >
            ×
          </button>
        )}
      </div>

      {/* Type chips (scrollable row) */}
      <div style={{
        padding: '0 18px 10px',
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        flexWrap: 'nowrap',
        flexShrink: 0,
      }}>
        {allTypes.map((et) => {
          const active = selectedTypeId === et.id;
          const accent = getAccent(et.dqlType);
          return (
            <button
              key={et.id}
              onClick={() => handleTypeSelect(et.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 999,
                background: active ? `${accent}22` : 'var(--bg-1)',
                border: `1px solid ${active ? accent : 'var(--border)'}`,
                color: active ? accent : 'var(--fg-3)',
                fontSize: 11,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                fontWeight: 500,
                transition: 'all 0.12s',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, display: 'inline-block', flexShrink: 0 }} />
              {et.label}
            </button>
          );
        })}
        {customTypesLoading && <ProgressCircle size="small" />}
      </div>

      {/* Entity list */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* On-canvas group */}
        {canvasEntities.length > 0 && (
          <>
            <div style={{
              padding: '6px 18px 4px',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--fg-mute)',
              fontWeight: 600,
            }}>
              On canvas · {canvasEntities.length}
            </div>
            {canvasEntities.map((e) => (
              <EntityRow
                key={e.entityId}
                displayName={e.displayName}
                type={e.type}
                state="added"
                onAdd={() => {}}
              />
            ))}
          </>
        )}

        {/* Available group */}
        <div style={{
          padding: '6px 18px 4px',
          fontSize: 10,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--fg-mute)',
          fontWeight: 600,
        }}>
          {isLoading ? 'Loading…' : `Available · ${availableEntities.length}`}
        </div>

        {error && (
          <div style={{ padding: '8px 18px', fontSize: 12, color: 'var(--danger)' }}>
            Failed to load: {error.message}
          </div>
        )}

        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
            <ProgressCircle size="small" />
          </div>
        )}

        {!isLoading && !error && availableEntities.length === 0 && (
          <div style={{ padding: '8px 18px', fontSize: 12, color: 'var(--fg-mute)' }}>
            No {selectedType?.label.toLowerCase() ?? 'entities'} found.
          </div>
        )}

        {availableEntities.map((entity) => (
          <EntityRow
            key={entity.entityId}
            displayName={entity.displayName}
            type={entity.type}
            state="idle"
            onAdd={() => onAddEntity(entity)}
          />
        ))}
      </div>
    </div>
  );
};

interface EntityRowProps {
  displayName: string;
  type: string;
  state: 'idle' | 'added';
  onAdd: () => void;
}

const EntityRow: React.FC<EntityRowProps> = ({ displayName, type, state, onAdd }) => {
  const [hovered, setHovered] = useState(false);
  const accent = getAccent(type);
  const isAdded = state === 'added';

  return (
    <div
      onClick={() => !isAdded && onAdd()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 18px 7px 18px',
        cursor: isAdded ? 'default' : 'pointer',
        background: hovered && !isAdded ? 'var(--hover)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {/* Type dot */}
      <span style={{
        width: 7,
        height: 7,
        borderRadius: 2,
        background: accent,
        flexShrink: 0,
      }} />

      {/* Name */}
      <span style={{
        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
        fontSize: 12,
        fontWeight: 500,
        color: isAdded ? 'var(--fg-mute)' : 'var(--fg)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        flex: 1,
        minWidth: 0,
      }}>
        {displayName}
      </span>

      {/* Status indicator */}
      {isAdded ? (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 9,
          padding: '2px 6px',
          borderRadius: 999,
          background: 'rgba(115, 190, 40, 0.12)',
          color: 'var(--dt-green)',
          border: '1px solid rgba(115, 190, 40, 0.25)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
          flexShrink: 0,
        }}>
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 12l5 5L20 7"/>
          </svg>
          Added
        </span>
      ) : (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--fg-mute)"
          strokeWidth="2"
          style={{ flexShrink: 0, opacity: hovered ? 1 : 0.5 }}
        >
          <path d="M12 5v14M5 12h14"/>
        </svg>
      )}
    </div>
  );
};

