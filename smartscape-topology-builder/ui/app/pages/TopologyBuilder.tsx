import React, { useState, useCallback, useId, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EntityBrowser } from '../components/EntityBrowser';
import { TopologyCanvas } from '../components/TopologyCanvas';
import { RuleInspector } from '../components/RuleInspector';
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
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
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
        setEdgeSourceId(entityId);
      }
    } else {
      setSelectedEntityId((prev) => prev === entityId ? null : entityId);
      setSelectedEdgeId(null);
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
    setSelectedEdgeId(null);
    if (mode === 'connect') setEdgeSourceId(null);
  }, [mode]);

  const handleEdgeSelect = useCallback((edgeId: string) => {
    setSelectedEdgeId((prev) => prev === edgeId ? null : edgeId);
    setSelectedEntityId(null);
  }, []);

  const handleEdgeRemove = useCallback((edgeId: string) => {
    setCanvasEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setSelectedEdgeId((prev) => prev === edgeId ? null : prev);
  }, []);

  const handleModeChange = useCallback((newMode: InteractionMode) => {
    setMode(newMode);
    setEdgeSourceId(null);
    setSelectedEntityId(null);
    setSelectedEdgeId(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (mode === 'connect') {
          if (edgeSourceId) {
            setEdgeSourceId(null);
          } else {
            setMode('select');
          }
        } else {
          setSelectedEntityId(null);
          setSelectedEdgeId(null);
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        const active = document.activeElement;
        if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA')) {
          handleEdgeRemove(selectedEdgeId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, edgeSourceId, selectedEdgeId, handleEdgeRemove]);

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
    const allErrors = [...result.errors, ...result.metricErrors, ...result.traceErrors];
    const hasSuccess = parts.length > 0;

    if (hasSuccess && !hasErrors) {
      setResultBanner({ text: `Created ${parts.join(', ')}.`, variant: 'success' });
    } else if (hasSuccess && hasErrors) {
      setResultBanner({ text: `Partially completed: ${parts.join(', ')}.`, variant: 'warning', details: allErrors.join('; ') });
    } else if (!hasSuccess && hasErrors) {
      setResultBanner({ text: 'Rule creation failed.', variant: 'critical', details: allErrors.join('; ') });
    } else {
      setResultBanner({ text: 'All rules already exist — no changes needed.', variant: 'success' });
    }
    setCanvasEdges([]);
    setSelectedEdgeId(null);
  }, []);

  const handleClearCanvas = useCallback(() => {
    setCanvasEntities([]);
    setCanvasEdges([]);
    setEdgeSourceId(null);
    setSelectedEntityId(null);
    setSelectedEdgeId(null);
  }, []);

  const handleAutoLayout = useCallback(() => {
    setCanvasEntities((prev) =>
      prev.map((e, i) => ({
        ...e,
        x: 60 + (i % 4) * (ENTITY_NODE_WIDTH + 80),
        y: 60 + Math.floor(i / 4) * (ENTITY_NODE_HEIGHT + 80),
      }))
    );
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Page header */}
      <div style={{
        padding: '14px 24px 12px',
        borderBottom: '1px solid var(--border-soft)',
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 11,
          color: 'var(--fg-mute)',
          letterSpacing: '0.08em',
          marginBottom: 4,
        }}>
          Topology › Builder
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--fg)' }}>
            Topology builder
          </h2>
          <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>
            Draw custom Smartscape relationships between entities
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{
        padding: '8px 18px',
        borderBottom: '1px solid var(--border-soft)',
        background: 'var(--bg-1)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}>
        {/* Mode segmented control */}
        <div style={{
          display: 'flex',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          {(['select', 'connect'] as InteractionMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              style={{
                padding: '5px 14px',
                border: 'none',
                background: mode === m ? 'var(--dt-purple)' : 'transparent',
                color: mode === m ? '#fff' : 'var(--fg-3)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.12s',
              }}
            >
              {m === 'select' ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 2l8 20 2-8 8-2z"/>
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M13 6l6 6-6 6"/>
                </svg>
              )}
              {m === 'select' ? 'Select' : 'Connect'}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />

        {/* Relationship type */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--fg-mute)', whiteSpace: 'nowrap' }}>Relationship</span>
          <select
            value={pendingRelType}
            onChange={(e) => setPendingRelType(e.target.value)}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: 'var(--fg)',
              fontSize: 12,
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              minWidth: 100,
            }}
          >
            {RELATIONSHIP_TYPES.map((rt) => (
              <option key={rt} value={rt}>{rt}</option>
            ))}
          </select>
        </div>

        {/* Bidirectional toggle */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <div
            onClick={() => setIsBidirectional((b) => !b)}
            style={{
              width: 28,
              height: 16,
              borderRadius: 999,
              background: isBidirectional ? 'var(--dt-purple)' : 'var(--border)',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s',
              flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute',
              top: 2,
              left: isBidirectional ? 14 : 2,
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.15s',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>Bidirectional</span>
        </label>

        <div style={{ width: 1, height: 24, background: 'var(--border)', flexShrink: 0 }} />

        {/* Auto-layout */}
        <button
          onClick={handleAutoLayout}
          disabled={canvasEntities.length === 0}
          title="Auto-arrange entities in a grid"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 11px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: canvasEntities.length === 0 ? 'var(--fg-mute)' : 'var(--fg-2)',
            cursor: canvasEntities.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          Layout
        </button>

        <div style={{ flex: 1 }} />

        {/* Right cluster: rule summary */}
        {(canvasEntities.length > 0 || canvasEdges.length > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              fontSize: 11,
              color: 'var(--fg-mute)',
            }}>
              {canvasEntities.length}E · {canvasEdges.length}R
            </span>
          </div>
        )}

        {edgeSourceId && mode === 'connect' && (
          <span style={{
            fontSize: 11,
            color: 'var(--dt-purple-soft)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9"/>
            </svg>
            Source selected
          </span>
        )}

        <button
          onClick={handleClearCanvas}
          disabled={canvasEntities.length === 0}
          style={{
            padding: '5px 14px', borderRadius: 7,
            border: '1px solid var(--border)', background: 'var(--bg)',
            color: canvasEntities.length === 0 ? 'var(--fg-mute)' : 'var(--fg-2)',
            cursor: canvasEntities.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 12,
          }}
        >
          Clear canvas
        </button>

        <button
          onClick={() => setShowConfirmModal(true)}
          disabled={canvasEdges.length === 0}
          style={{
            padding: '5px 16px', borderRadius: 7,
            border: 'none',
            background: canvasEdges.length === 0 ? 'rgba(111, 45, 168, 0.25)' : 'var(--dt-purple)',
            color: canvasEdges.length === 0 ? 'var(--fg-mute)' : '#fff',
            cursor: canvasEdges.length === 0 ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Create {canvasEdges.length > 0 ? `${canvasEdges.length} ` : ''}rule{canvasEdges.length !== 1 ? 's' : ''}
        </button>
      </div>

      {/* Result banner */}
      {resultBanner && (
        <div style={{
          padding: '9px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: resultBanner.variant === 'critical'
            ? 'rgba(229, 72, 77, 0.10)'
            : resultBanner.variant === 'warning'
              ? 'rgba(224, 168, 0, 0.10)'
              : 'rgba(115, 190, 40, 0.10)',
          borderBottom: '1px solid',
          borderBottomColor: resultBanner.variant === 'critical'
            ? 'rgba(229, 72, 77, 0.25)'
            : resultBanner.variant === 'warning'
              ? 'rgba(224, 168, 0, 0.25)'
              : 'rgba(115, 190, 40, 0.25)',
          flexShrink: 0,
        }}>
          {resultBanner.variant === 'critical' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
          ) : resultBanner.variant === 'warning' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" strokeWidth="2"><path d="M10.3 3.2l-7.7 13.3A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-3.5L13.7 3.2a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dt-green)" strokeWidth="2"><path d="M5 12l5 5L20 7"/></svg>
          )}
          <span style={{
            fontSize: 12,
            color: resultBanner.variant === 'critical' ? 'var(--danger)'
              : resultBanner.variant === 'warning' ? 'var(--warn)' : 'var(--dt-green)',
            flex: 1,
          }}>
            {resultBanner.text}
            {resultBanner.details && (
              <span style={{ color: 'var(--fg-mute)', marginLeft: 8, fontSize: 11 }}>{resultBanner.details}</span>
            )}
          </span>
          <button
            onClick={() => navigate('/audit')}
            style={{
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 5, padding: '3px 10px', fontSize: 11,
              color: 'var(--fg-2)', cursor: 'pointer',
            }}
          >
            View Audit Trail
          </button>
          <button
            onClick={() => setResultBanner(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--fg-mute)', padding: '0 4px' }}
          >
            ×
          </button>
        </div>
      )}

      {/* 3-panel body */}
      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) 280px', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <EntityBrowser
          onAddEntity={handleAddEntity}
          addedEntityIds={addedEntityIds}
          canvasEntities={canvasEntities}
        />

        <TopologyCanvas
          entities={canvasEntities}
          edges={canvasEdges}
          mode={mode}
          edgeSourceId={edgeSourceId}
          selectedEdgeId={selectedEdgeId}
          onEntityMove={handleEntityMove}
          onEntitySelect={handleEntitySelect}
          onEntityRemove={handleEntityRemove}
          onCanvasClick={handleCanvasClick}
          onEdgeSelect={handleEdgeSelect}
          onEdgeRemove={handleEdgeRemove}
          selectedEntityId={selectedEntityId}
          onContextMenu={handleCanvasContextMenu}
        />

        <RuleInspector
          edges={canvasEdges}
          entities={canvasEntities}
          selectedEdgeId={selectedEdgeId}
          onEdgeRemove={handleEdgeRemove}
        />
      </div>

      <ConfirmTopologyModal
        isOpen={showConfirmModal}
        edges={canvasEdges}
        entities={canvasEntities}
        onConfirm={handleConfirmCreate}
        onClose={() => setShowConfirmModal(false)}
      />
    </div>
  );
};
