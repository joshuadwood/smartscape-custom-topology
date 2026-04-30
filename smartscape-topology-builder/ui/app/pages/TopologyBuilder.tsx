import React, { useState, useCallback, useId, useEffect } from 'react';
import { Flex } from '@dynatrace/strato-components/layouts';
import { Heading, Text } from '@dynatrace/strato-components/typography';
import { Button } from '@dynatrace/strato-components/buttons';
import { Select } from '@dynatrace/strato-components-preview/forms';
import { Tooltip } from '@dynatrace/strato-components-preview/overlays';
import Colors from '@dynatrace/strato-design-tokens/colors';
import { useNavigate } from 'react-router-dom';
import { EntityBrowser } from '../components/EntityBrowser';
import { TopologyCanvas } from '../components/TopologyCanvas';
import { ConfirmTopologyModal } from '../components/ConfirmTopologyModal';
import type {
  CanvasEntity, CanvasEdge, DynatraceEntity, InteractionMode,
} from '../types';
import { RELATIONSHIP_TYPES } from '../types';
import type { PlanExecutionResult } from '../api/topology';
import { ENTITY_NODE_WIDTH, ENTITY_NODE_HEIGHT } from '../components/EntityNodeCard';

type ResultBanner = { text: string; variant: 'success' | 'warning' | 'critical'; details?: string };

const BANNER_STORAGE_KEY = 'topology-builder-result-banner';

function loadBanner(): ResultBanner | null {
  try {
    const stored = sessionStorage.getItem(BANNER_STORAGE_KEY);
    return stored ? JSON.parse(stored) as ResultBanner : null;
  } catch {
    return null;
  }
}

function saveBanner(banner: ResultBanner | null): void {
  try {
    if (banner) {
      sessionStorage.setItem(BANNER_STORAGE_KEY, JSON.stringify(banner));
    } else {
      sessionStorage.removeItem(BANNER_STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

export const TopologyBuilder: React.FC = () => {
  const [canvasEntities, setCanvasEntities] = useState<CanvasEntity[]>([]);
  const [canvasEdges, setCanvasEdges] = useState<CanvasEdge[]>([]);
  const [mode, setMode] = useState<InteractionMode>('select');
  const [edgeSourceId, setEdgeSourceId] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [pendingRelType, setPendingRelType] = useState<string>('CALLS');
  const [isBidirectional, setIsBidirectional] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [resultBanner, setResultBannerRaw] = useState<ResultBanner | null>(loadBanner);
  const setResultBanner = useCallback((banner: ResultBanner | null) => {
    setResultBannerRaw(banner);
    saveBanner(banner);
  }, []);
  const idPrefix = useId();
  const navigate = useNavigate();

  const addedEntityIds = new Set(canvasEntities.map((e) => e.entityId));

  // Place new entities in a grid layout
  const getNextPosition = useCallback(() => {
    const col = canvasEntities.length % 4;
    const row = Math.floor(canvasEntities.length / 4);
    return {
      x: 60 + col * (ENTITY_NODE_WIDTH + 80),
      y: 60 + row * (ENTITY_NODE_HEIGHT + 80),
    };
  }, [canvasEntities.length]);

  const handleAddEntity = useCallback((entity: DynatraceEntity) => {
    const pos = getNextPosition();
    setCanvasEntities((prev) => [
      ...prev,
      { ...entity, x: pos.x, y: pos.y, width: ENTITY_NODE_WIDTH, height: ENTITY_NODE_HEIGHT },
    ]);
  }, [getNextPosition]);

  const handleEntityMove = useCallback((entityId: string, x: number, y: number) => {
    setCanvasEntities((prev) =>
      prev.map((e) => e.entityId === entityId ? { ...e, x: Math.max(0, x), y: Math.max(0, y) } : e)
    );
  }, []);

  const handleEntitySelect = useCallback((entityId: string) => {
    if (mode === 'connect') {
      if (!edgeSourceId) {
        setEdgeSourceId(entityId);
      } else if (edgeSourceId === entityId) {
        setEdgeSourceId(null);
      } else {
        // Create edge
        const edgeId = `${idPrefix}-${edgeSourceId}-${entityId}`;
        const duplicate = canvasEdges.some(
          (e) => (e.sourceEntityId === edgeSourceId && e.targetEntityId === entityId)
            || (e.sourceEntityId === entityId && e.targetEntityId === edgeSourceId)
        );
        if (!duplicate) {
          setCanvasEdges((prev) => [
            ...prev,
            {
              id: edgeId,
              sourceEntityId: edgeSourceId,
              targetEntityId: entityId,
              relationshipType: pendingRelType,
              bidirectional: isBidirectional,
            },
          ]);
        }
        setEdgeSourceId(entityId); // stay in connect mode, new source is target
      }
    } else {
      setSelectedEntityId((prev) => prev === entityId ? null : entityId);
    }
  }, [mode, edgeSourceId, canvasEdges, pendingRelType, isBidirectional, idPrefix]);

  const handleEntityRemove = useCallback((entityId: string) => {
    setCanvasEntities((prev) => prev.filter((e) => e.entityId !== entityId));
    setCanvasEdges((prev) =>
      prev.filter((e) => e.sourceEntityId !== entityId && e.targetEntityId !== entityId)
    );
    if (selectedEntityId === entityId) setSelectedEntityId(null);
    if (edgeSourceId === entityId) setEdgeSourceId(null);
  }, [selectedEntityId, edgeSourceId]);

  const handleCanvasClick = useCallback(() => {
    setSelectedEntityId(null);
    if (mode === 'connect') setEdgeSourceId(null);
  }, [mode]);

  const handleEdgeRemove = useCallback((edgeId: string) => {
    setCanvasEdges((prev) => prev.filter((e) => e.id !== edgeId));
  }, []);

  const handleModeChange = useCallback((newMode: InteractionMode) => {
    setMode(newMode);
    setEdgeSourceId(null);
    setSelectedEntityId(null);
  }, []);

  // ESC key: cancel edge source selection, or exit connect mode entirely
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode === 'connect') {
          if (edgeSourceId) {
            setEdgeSourceId(null); // first ESC clears source selection
          } else {
            setMode('select'); // second ESC exits connect mode
          }
        } else {
          setSelectedEntityId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, edgeSourceId]);

  // Right-click on canvas: cancel connect source or exit connect mode
  const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    if (mode === 'connect') {
      e.preventDefault();
      if (edgeSourceId) {
        setEdgeSourceId(null);
      } else {
        setMode('select');
      }
    }
  }, [mode, edgeSourceId]);

  const handleConfirmCreate = useCallback((result: PlanExecutionResult) => {
    const parts: string[] = [];
    if (result.typesCreated.length > 0) parts.push(`${result.typesCreated.length} generic type(s)`);
    if (result.relationshipsCreated.length > 0) parts.push(`${result.relationshipsCreated.length} relationship(s)`);
    if (result.metricsIngested > 0) parts.push(`${result.metricsIngested} metric(s) ingested`);
    if (result.tracesIngested > 0) parts.push(`${result.tracesIngested} trace(s) for Smartscape`);

    const hasErrors = result.errors.length > 0 || result.metricErrors.length > 0;
    const hasTraceErrors = result.traceErrors.length > 0;
    const hasSuccess = parts.length > 0;
    const allErrors = [...result.errors, ...result.metricErrors, ...result.traceErrors];

    if (hasSuccess && !hasErrors) {
      setResultBanner({
        text: `Created ${parts.join(', ')}. Rules are in Settings > Topology model.`,
        variant: 'success',
      });
    } else if (hasSuccess && hasErrors) {
      setResultBanner({
        text: `Partially completed: ${parts.join(', ')}.`,
        variant: 'warning',
        details: allErrors.join('; '),
      });
    } else if (!hasSuccess && hasErrors) {
      setResultBanner({
        text: 'Rule creation failed.',
        variant: 'critical',
        details: allErrors.join('; '),
      });
    } else {
      setResultBanner({
        text: 'All rules already exist — no changes were needed.',
        variant: 'success',
      });
    }
    setCanvasEdges([]);
  }, []);

  const selectedEntity = canvasEntities.find((e) => e.entityId === selectedEntityId);

  return (
    <Flex flexDirection="column" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '8px 16px',
        borderBottom: `1px solid ${Colors.Border.Neutral.Default}`,
        background: Colors.Background.Surface.Default,
        flexShrink: 0,
      }}>
        <Flex alignItems="center" gap={12} flexWrap="wrap">
          <Heading level={5} style={{ margin: 0 }}>Topology Builder</Heading>

          <div style={{ width: 1, height: 24, background: Colors.Border.Neutral.Default }} />

          {/* Mode buttons */}
          <Flex gap={4}>
            <ModeButton active={mode === 'select'} onClick={() => handleModeChange('select')} title="Select & Drag entities">
              ✥ Select
            </ModeButton>
            <ModeButton active={mode === 'connect'} onClick={() => handleModeChange('connect')} title="Click source then target to draw edge">
              ⟶ Connect
            </ModeButton>
          </Flex>

          {/* Connect mode options */}
          {mode === 'connect' && (
            <Flex alignItems="center" gap={8}>
              <Text style={{ fontSize: 13 }}>Relationship:</Text>
              <Select
                value={pendingRelType}
                onChange={(v) => setPendingRelType(String(v))}
                style={{ minWidth: 130 }}
              >
                <Select.Content>
                  {RELATIONSHIP_TYPES.map((rt) => (
                    <Select.Option key={rt} value={rt}>{rt}</Select.Option>
                  ))}
                </Select.Content>
              </Select>
              <Flex alignItems="center" gap={4}>
                <input
                  type="checkbox"
                  id="bidir-toggle"
                  checked={isBidirectional}
                  onChange={(e) => setIsBidirectional(e.target.checked)}
                />
                <label htmlFor="bidir-toggle" style={{ fontSize: 13, cursor: 'pointer' }}>Bidirectional</label>
              </Flex>
              {edgeSourceId && (
                <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>
                  Source selected — click a target entity
                </Text>
              )}
            </Flex>
          )}

          <div style={{ flex: 1 }} />

          {/* Clear & Create */}
          <Button
            variant="default"
            onClick={() => { setCanvasEntities([]); setCanvasEdges([]); setEdgeSourceId(null); setSelectedEntityId(null); }}
            disabled={canvasEntities.length === 0}
          >
            Clear Canvas
          </Button>
          <Button
            variant="accent"
            onClick={() => setShowConfirmModal(true)}
            disabled={canvasEdges.length === 0}
          >
            Create {canvasEdges.length > 0 ? `${canvasEdges.length} ` : ''}Rule{canvasEdges.length !== 1 ? 's' : ''}
          </Button>
        </Flex>

        {/* Connect mode hint */}
        {mode === 'connect' && (
          <Text color="secondary" style={{ fontSize: 12, marginTop: 4, display: 'block' }}>
            💡 Click an entity to set as source, then click another entity to create a directed edge. Click the edge to remove it.
            Press <strong>ESC</strong> or <strong>right-click</strong> to cancel.
          </Text>
        )}

        {resultBanner && (
          <div style={{
            marginTop: 8,
            padding: '10px 14px',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: resultBanner.variant === 'critical' ? Colors.Background.Container.Critical.Default
              : resultBanner.variant === 'warning' ? Colors.Background.Container.Warning.Default : Colors.Background.Container.Success.Default,
            border: `1px solid ${resultBanner.variant === 'critical' ? Colors.Border.Critical.Default
              : resultBanner.variant === 'warning' ? Colors.Border.Warning.Default : Colors.Border.Success.Default}`,
          }}>
            <span style={{ fontSize: 16 }}>
              {resultBanner.variant === 'critical' ? '❌' : resultBanner.variant === 'warning' ? '⚠️' : '✅'}
            </span>
            <div style={{ flex: 1 }}>
              <Text style={{
                fontSize: 13,
                color: resultBanner.variant === 'critical' ? Colors.Text.Critical.Default
                  : resultBanner.variant === 'warning' ? Colors.Text.Warning.Default : Colors.Text.Success.Default,
              }}>
                {resultBanner.text}
              </Text>
              {resultBanner.details && (
                <Text style={{ fontSize: 11, display: 'block', marginTop: 4,
                  color: Colors.Text.Neutral.Subdued }}>
                  {resultBanner.details}
                </Text>
              )}
            </div>
            <button
              onClick={() => navigate('/audit')}
              style={{
                background: Colors.Background.Container.Neutral.Subdued,
                border: `1px solid ${Colors.Border.Neutral.Default}`,
                borderRadius: 4,
                padding: '4px 12px',
                fontSize: 12,
                color: Colors.Text.Neutral.Default,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              📜 View Audit Trail
            </button>
            <button
              onClick={() => setResultBanner(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: Colors.Text.Neutral.Subdued, padding: '0 4px' }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Main area */}
      <Flex style={{ flex: 1, overflow: 'hidden' }}>
        <EntityBrowser onAddEntity={handleAddEntity} addedEntityIds={addedEntityIds} />

        <TopologyCanvas
          entities={canvasEntities}
          edges={canvasEdges}
          mode={mode}
          edgeSourceId={edgeSourceId}
          onEntityMove={handleEntityMove}
          onEntitySelect={handleEntitySelect}
          onEntityRemove={handleEntityRemove}
          onCanvasClick={handleCanvasClick}
          onEdgeRemove={handleEdgeRemove}
          selectedEntityId={selectedEntityId}
          onContextMenu={handleCanvasContextMenu}
        />

        {/* Entity detail panel */}
        {selectedEntity && mode === 'select' && (
          <EntityDetailPanel entity={selectedEntity} />
        )}
      </Flex>

      <ConfirmTopologyModal
        isOpen={showConfirmModal}
        edges={canvasEdges}
        entities={canvasEntities}
        onConfirm={handleConfirmCreate}
        onClose={() => setShowConfirmModal(false)}
      />
    </Flex>
  );
};

interface ModeButtonProps {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

const ModeButton: React.FC<ModeButtonProps> = ({ active, onClick, title, children }) => (
  <Tooltip text={title}>
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: 4,
        border: `1px solid ${active ? Colors.Border.Neutral.Accent : Colors.Border.Neutral.Default}`,
        background: active ? Colors.Background.Container.Neutral.Accent : Colors.Background.Surface.Default,
        color: active ? Colors.Text.Neutral.OnAccent.Default : Colors.Text.Neutral.Default,
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  </Tooltip>
);

interface EntityDetailPanelProps {
  entity: CanvasEntity;
}

const EntityDetailPanel: React.FC<EntityDetailPanelProps> = ({ entity }) => (
  <div style={{
    width: 240, borderLeft: `1px solid ${Colors.Border.Neutral.Default}`,
    padding: 16, overflowY: 'auto', flexShrink: 0,
    background: Colors.Background.Surface.Default,
  }}>
    <Heading level={6}>Entity Details</Heading>
    <Text style={{ fontWeight: 600, fontSize: 14, display: 'block', marginTop: 8 }}>
      {entity.displayName}
    </Text>
    <Text color="secondary" style={{ fontSize: 12, display: 'block' }}>{entity.type}</Text>

    <div style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Entity ID</Text>
      <Text color="secondary" style={{ fontSize: 11, wordBreak: 'break-all' }}>{entity.entityId}</Text>
    </div>

    {entity.tags.length > 0 && (
      <div style={{ marginTop: 12 }}>
        <Text style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Tags</Text>
        <Flex flexWrap="wrap" gap={4}>
          {entity.tags.map((tag) => (
            <span
              key={`${tag.context}:${tag.key}:${tag.value ?? ''}`}
              style={{
                fontSize: 11, padding: '2px 6px', borderRadius: 10,
                background: Colors.Background.Surface.Backdrop,
                color: Colors.Text.Neutral.Default,
              }}
            >
              {tag.value ? `${tag.key}: ${tag.value}` : tag.key}
            </span>
          ))}
        </Flex>
      </div>
    )}
  </div>
);
