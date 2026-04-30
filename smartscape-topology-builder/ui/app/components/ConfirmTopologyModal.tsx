import React, { useState, useMemo, useEffect } from 'react';
import { Modal } from '@dynatrace/strato-components-preview/overlays';
import { Button } from '@dynatrace/strato-components/buttons';
import { Flex } from '@dynatrace/strato-components/layouts';
import { Paragraph, Text } from '@dynatrace/strato-components/typography';
import Colors from '@dynatrace/strato-design-tokens/colors';
import type { CanvasEdge, CanvasEntity, RelationshipType, TopologyRule, TopologyCreationPlan } from '../types';
import { RELATIONSHIP_TYPES } from '../types';
import {
  buildTopologyPlan,
  executePlan,
  listGenericTypes,
  extractEntityType,
  isBuiltinType,
  edgeNeedsBridge,
  ingestMetrics,
  type PlanExecutionResult,
} from '../api/topology';
import { recordAuditEntry } from '../api/audit';

interface ConfirmTopologyModalProps {
  isOpen: boolean;
  edges: CanvasEdge[];
  entities: CanvasEntity[];
  onConfirm: (result: PlanExecutionResult) => void;
  onClose: () => void;
}

export const ConfirmTopologyModal: React.FC<ConfirmTopologyModalProps> = ({
  isOpen,
  edges,
  entities,
  onConfirm,
  onClose,
}) => {
  const [relTypes, setRelTypes] = useState<Record<string, RelationshipType>>({});
  const [bidirMap, setBidirMap] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [showPlanPreview, setShowPlanPreview] = useState(false);
  const [plan, setPlan] = useState<TopologyCreationPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [existingTypes, setExistingTypes] = useState<Set<string>>(new Set());
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [pendingMetrics, setPendingMetrics] = useState<string[]>([]);
  const [metricWarning, setMetricWarning] = useState<string | null>(null);
  const [retryingMetrics, setRetryingMetrics] = useState(false);
  const [metricsCopied, setMetricsCopied] = useState(false);

  const getEntity = (id: string) => entities.find((e) => e.entityId === id);

  // Load existing generic types when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);
    setProgressMsg(null);
    setPlan(null);
    setPlanError(null);
    setShowPlanPreview(false);
    setPendingMetrics([]);
    setMetricWarning(null);
    setMetricsCopied(false);

    let cancelled = false;
    const loadTypes = async () => {
      setLoadingTypes(true);
      try {
        const types = await listGenericTypes();
        if (!cancelled) setExistingTypes(new Set(types.map((t) => t.name)));
      } catch (err) {
        console.error('Failed to load generic types:', err);
      } finally {
        if (!cancelled) setLoadingTypes(false);
      }
    };
    void loadTypes();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Build tentative rules from canvas edges
  const tentativeRules: TopologyRule[] = useMemo(() => {
    return edges.map((edge) => {
      const src = getEntity(edge.sourceEntityId);
      const tgt = getEntity(edge.targetEntityId);
      return {
        sourceEntityId: edge.sourceEntityId,
        sourceDisplayName: src?.displayName ?? edge.sourceEntityId,
        targetEntityId: edge.targetEntityId,
        targetDisplayName: tgt?.displayName ?? edge.targetEntityId,
        relationshipType: relTypes[edge.id] ?? edge.relationshipType,
        bidirectional: bidirMap[edge.id] ?? edge.bidirectional,
      };
    });
  }, [edges, entities, relTypes, bidirMap]);

  // Check which edges need a bridge (built-in ↔ built-in)
  const edgeBridgeInfo = useMemo(() => {
    const info: Record<string, string> = {};
    for (const edge of edges) {
      if (edgeNeedsBridge(edge.sourceEntityId, edge.targetEntityId)) {
        const srcType = extractEntityType(edge.sourceEntityId).toUpperCase();
        const tgtType = extractEntityType(edge.targetEntityId).toUpperCase();
        info[edge.id] =
          `Both ${srcType} and ${tgtType} are built-in types. ` +
          `A bridge entity will be auto-created to connect them.`;
      }
    }
    return info;
  }, [edges]);

  const handlePreviewPlan = async () => {
    setPlanError(null);
    try {
      const p = await buildTopologyPlan(tentativeRules, existingTypes);
      setPlan(p);
      setShowPlanPreview(true);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setProgressMsg(null);
    setMetricWarning(null);
    setPendingMetrics([]);
    setMetricsCopied(false);

    try {
      const p = plan ?? await buildTopologyPlan(tentativeRules, existingTypes);
      const result = await executePlan(p, (step) => setProgressMsg(step), tentativeRules);

      // Record audit trail entry (best-effort, don't block on failure)
      try {
        await recordAuditEntry(tentativeRules, result);
      } catch (err) {
        console.warn('Failed to record audit entry:', err);
      }

      // Separate blocking errors (type/relationship failures) from metric warnings
      if (result.errors.length > 0) {
        setSubmitError(
          `Completed with ${result.errors.length} error(s):\n${result.errors.join('\n\n')}`
        );
      }

      // Metric ingest failures are non-blocking warnings
      if (result.metricErrors.length > 0) {
        setMetricWarning(result.metricErrors.join('\n'));
        setPendingMetrics(result.pendingMetricLines);
      }

      onConfirm(result);
      // Only auto-close if no errors AND no metric warnings
      if (result.errors.length === 0 && result.metricErrors.length === 0) {
        onClose();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
      setProgressMsg(null);
    }
  };

  const handleRetryMetrics = async () => {
    if (pendingMetrics.length === 0) return;
    setRetryingMetrics(true);
    setMetricWarning(null);
    try {
      await ingestMetrics(pendingMetrics);
      setPendingMetrics([]);
      setMetricWarning(null);
    } catch (err) {
      setMetricWarning(err instanceof Error ? err.message : String(err));
    } finally {
      setRetryingMetrics(false);
    }
  };

  const handleCopyMetrics = () => {
    if (pendingMetrics.length === 0) return;
    void navigator.clipboard.writeText(pendingMetrics.join('\n'));
    setMetricsCopied(true);
    setTimeout(() => setMetricsCopied(false), 2000);
  };

  return (
    <Modal show={isOpen} onDismiss={onClose} title="Create Topology Rules">
      <Flex flexDirection="column" gap={16} style={{ minWidth: 550, maxWidth: 750 }}>
        <Paragraph>
          This will create <strong>generic entity types</strong> (if needed),{' '}
          <strong>relationship rules</strong>, <strong>bridge entities</strong>,{' '}
          and <strong>ingest events</strong>{' '}
          to trigger Dynatrace topology extraction. Rules appear in{' '}
          <em>Settings &gt; Topology model</em>.
        </Paragraph>

        {loadingTypes && (
          <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>Loading existing generic types...</Text>
        )}

        {/* Error display (blocking errors from types/relationships) */}
        {(submitError || planError) && (
          <div style={{
            background: Colors.Background.Container.Critical.Default,
            border: `1px solid ${Colors.Border.Critical.Default}`,
            borderRadius: 6,
            padding: 12,
            maxHeight: 200,
            overflowY: 'auto',
          }}>
            <pre style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontSize: 11,
              lineHeight: 1.4,
              color: Colors.Text.Critical.Default,
              margin: 0,
            }}>
              {submitError ?? planError}
            </pre>
          </div>
        )}

        {/* Metric ingest warning (non-blocking) with Retry / Copy buttons */}
        {metricWarning && (
          <div style={{
            background: Colors.Background.Container.Warning.Default,
            border: `1px solid ${Colors.Border.Warning.Default}`,
            borderRadius: 6,
            padding: 12,
          }}>
            <Text style={{ fontSize: 12, fontWeight: 600, color: Colors.Text.Warning.Default, display: 'block', marginBottom: 4 }}>
              ⚠ Event ingest failed (types &amp; relationships were created successfully)
            </Text>
            <pre style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontSize: 11,
              lineHeight: 1.4,
              color: Colors.Text.Warning.Default,
              margin: '4px 0 8px 0',
              maxHeight: 100,
              overflowY: 'auto',
            }}>
              {metricWarning}
            </pre>
            <Text style={{ fontSize: 11, color: Colors.Text.Neutral.Subdued, display: 'block', marginBottom: 8 }}>
              Your user account needs the <strong>environment-api:events:write</strong> IAM permission.
              Ask your account admin, or copy the event lines and ingest via API token / dtctl.
            </Text>
            <Flex gap={8}>
              <Button
                variant="default"
                onClick={() => void handleRetryMetrics()}
                disabled={retryingMetrics}
              >
                {retryingMetrics ? 'Retrying...' : '↻ Retry Events'}
              </Button>
              <Button
                variant="default"
                onClick={handleCopyMetrics}
              >
                {metricsCopied ? '✓ Copied!' : '📋 Copy Event Lines'}
              </Button>
            </Flex>
          </div>
        )}

        {/* Progress */}
        {progressMsg && (
          <Text style={{ fontSize: 12, color: Colors.Text.Neutral.Subdued }}>
            {progressMsg}
          </Text>
        )}

        {/* Edge list */}
        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {edges.map((edge) => {
            const src = getEntity(edge.sourceEntityId);
            const tgt = getEntity(edge.targetEntityId);
            const relType = relTypes[edge.id] ?? edge.relationshipType as RelationshipType;
            const bidir = bidirMap[edge.id] ?? edge.bidirectional;
            const bridgeNotice = edgeBridgeInfo[edge.id];

            return (
              <EdgeRuleRow
                key={edge.id}
                edgeId={edge.id}
                sourceDisplay={src?.displayName ?? edge.sourceEntityId}
                sourceType={src?.type ?? extractEntityType(edge.sourceEntityId)}
                targetDisplay={tgt?.displayName ?? edge.targetEntityId}
                targetType={tgt?.type ?? extractEntityType(edge.targetEntityId)}
                relType={relType}
                bidirectional={bidir}
                bridgeNotice={bridgeNotice}
                onRelTypeChange={(val) => setRelTypes((prev) => ({ ...prev, [edge.id]: val }))}
                onBidirChange={(val) => setBidirMap((prev) => ({ ...prev, [edge.id]: val }))}
              />
            );
          })}
        </div>

        {/* Plan preview toggle */}
        <div>
          <button
            onClick={() => void handlePreviewPlan()}
            disabled={loadingTypes}
            style={{
              background: 'none',
              border: `1px solid ${Colors.Border.Neutral.Default}`,
              borderRadius: 4,
              padding: '4px 12px',
              cursor: loadingTypes ? 'not-allowed' : 'pointer',
              fontSize: 12,
              color: Colors.Text.Neutral.Default,
              opacity: loadingTypes ? 0.5 : 1,
            }}
          >
            {showPlanPreview ? '▾ Hide' : '▸ Show'} Execution Plan Preview
          </button>

          {showPlanPreview && plan && (
            <div style={{ marginTop: 8 }}>
              {plan.genericTypes.length > 0 && (
                <PlanSection title={`Step 1: Create ${plan.genericTypes.length} Generic Type(s)`} color={Colors.Text.Primary.Default}>
                  {plan.genericTypes.map((t) => (
                    <div key={t.name} style={{ fontSize: 12, padding: '2px 0' }}>
                      <strong>{t.name}</strong> — {t.displayName}
                    </div>
                  ))}
                </PlanSection>
              )}

              <PlanSection title={`Step 2: Create ${plan.relationships.length} Relationship Rule(s)`} color={Colors.Text.Success.Default}>
                {plan.relationships.map((r, i) => (
                  <div key={i} style={{ fontSize: 12, padding: '2px 0' }}>
                    <strong>{r.fromType}</strong> → <strong>{r.toType}</strong> ({r.typeOfRelation})
                  </div>
                ))}
              </PlanSection>

              <PlanSection title={`Step 3: Ingest ${plan.metricLines.length} Event(s)`} color={Colors.Text.Warning.Default}>
                <pre style={{
                  fontSize: 10, lineHeight: 1.3, margin: 0,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                  color: Colors.Text.Warning.Default,
                }}>
                  {plan.metricLines.join('\n')}
                </pre>
              </PlanSection>
            </div>
          )}
        </div>

        {/* Actions */}
        <Flex justifyContent="flex-end" gap={8}>
          <Button variant="default" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || edges.length === 0 || loadingTypes}
          >
            {isSubmitting ? 'Creating...' : `Create ${edges.length} Rule${edges.length !== 1 ? 's' : ''}`}
          </Button>
        </Flex>
      </Flex>
    </Modal>
  );
};

// ─── Sub-components ──────────────────────────────────────────────────────────

interface PlanSectionProps {
  title: string;
  color: string;
  children: React.ReactNode;
}

const PlanSection: React.FC<PlanSectionProps> = ({ title, color, children }) => (
  <div style={{
    marginBottom: 8,
    padding: '8px 12px',
    borderRadius: 6,
    border: `1px solid ${color}40`,
    background: `${color}10`,
  }}>
    <Text style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color }}>
      {title}
    </Text>
    {children}
  </div>
);

interface EdgeRuleRowProps {
  edgeId: string;
  sourceDisplay: string;
  sourceType: string;
  targetDisplay: string;
  targetType: string;
  relType: RelationshipType;
  bidirectional: boolean;
  bridgeNotice?: string;
  onRelTypeChange: (val: RelationshipType) => void;
  onBidirChange: (val: boolean) => void;
}

const EdgeRuleRow: React.FC<EdgeRuleRowProps> = ({
  sourceDisplay, sourceType, targetDisplay, targetType,
  relType, bidirectional, bridgeNotice, onRelTypeChange, onBidirChange,
}) => (
  <div style={{
    padding: '12px 0',
    borderBottom: `1px solid ${Colors.Border.Neutral.Default}`,
  }}>
    <Flex alignItems="center" gap={8} flexWrap="wrap">
      <div style={{ flex: 1, minWidth: 120 }}>
        <Text style={{ fontWeight: 600, fontSize: 13, display: 'block' }}>{sourceDisplay}</Text>
        <EntityTypeBadge type={sourceType} />
      </div>

      <Flex flexDirection="column" alignItems="center" gap={4} style={{ flex: '0 0 auto' }}>
        <select
          value={relType}
          onChange={(e) => onRelTypeChange(e.target.value as RelationshipType)}
          style={{
            minWidth: 140,
            padding: '6px 8px',
            borderRadius: 4,
            border: `1px solid ${Colors.Border.Neutral.Default}`,
            background: Colors.Background.Surface.Default,
            color: Colors.Text.Neutral.Default,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {RELATIONSHIP_TYPES.map((rt) => (
            <option key={rt} value={rt}>{rt}</option>
          ))}
        </select>
        <Flex alignItems="center" gap={4}>
          <input
            type="checkbox"
            id={`bidir-${sourceDisplay}`}
            checked={bidirectional}
            onChange={(e) => onBidirChange(e.target.checked)}
          />
          <label htmlFor={`bidir-${sourceDisplay}`} style={{ fontSize: 12, cursor: 'pointer' }}>
            Bidirectional
          </label>
        </Flex>
      </Flex>

      <div style={{ flex: 1, minWidth: 120, textAlign: 'right' }}>
        <Text style={{ fontWeight: 600, fontSize: 13, display: 'block' }}>{targetDisplay}</Text>
        <EntityTypeBadge type={targetType} />
      </div>
    </Flex>

    {bridgeNotice && (
      <div style={{
        marginTop: 6,
        padding: '4px 8px',
        borderRadius: 4,
        background: Colors.Background.Container.Primary.Default,
        border: `1px solid ${Colors.Border.Primary.Default}`,
        fontSize: 11,
        color: Colors.Text.Primary.Default,
      }}>
        🔗 {bridgeNotice}
      </div>
    )}

    <Text style={{ marginTop: 4, color: Colors.Text.Neutral.Subdued, fontSize: 11, display: 'block' }}>
      {bidirectional ? `${sourceDisplay} ↔ ${targetDisplay}` : `${sourceDisplay} → ${targetDisplay}`}
    </Text>
  </div>
);

const EntityTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const builtin = isBuiltinType(type.toLowerCase());
  return (
    <span style={{
      fontSize: 10,
      padding: '1px 6px',
      borderRadius: 10,
      background: builtin ? Colors.Charts.Categorical.Color01.Default : Colors.Charts.Categorical.Color05.Default,
      color: Colors.Text.Neutral.OnAccent.Default,
      fontWeight: 500,
    }}>
      {builtin ? 'built-in' : 'generic'} · {type}
    </span>
  );
};
