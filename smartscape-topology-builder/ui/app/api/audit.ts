import { stateClient } from '@dynatrace-sdk/client-state';
import type { AuditEntry, AuditEdge, TopologyRule } from '../types';
import type { PlanExecutionResult } from './topology';

const AUDIT_STATE_KEY = 'topology-builder-audit-trail';
const MAX_ENTRIES = 100;

/**
 * Read all audit entries from App State.
 */
export async function getAuditTrail(): Promise<AuditEntry[]> {
  try {
    const state = await stateClient.getAppState({ key: AUDIT_STATE_KEY });
    if (state?.value) {
      return JSON.parse(state.value) as AuditEntry[];
    }
  } catch {
    // No audit data yet
  }
  return [];
}

/**
 * Record a new audit entry after a topology plan execution.
 */
export async function recordAuditEntry(
  rules: TopologyRule[],
  result: PlanExecutionResult,
): Promise<void> {
  const edges: AuditEdge[] = rules.map((r) => ({
    sourceEntityId: r.sourceEntityId,
    sourceDisplayName: r.sourceDisplayName,
    sourceType: r.sourceEntityId.split('-')[0] ?? 'unknown',
    targetEntityId: r.targetEntityId,
    targetDisplayName: r.targetDisplayName,
    targetType: r.targetEntityId.split('-')[0] ?? 'unknown',
    relationshipType: r.relationshipType,
    bidirectional: r.bidirectional,
  }));

  const entry: AuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    edges,
    typesCreated: result.typesCreated,
    relationshipsCreated: result.relationshipsCreated,
    metricsIngested: result.metricsIngested,
    errors: result.errors,
    metricErrors: result.metricErrors,
  };

  const existing = await getAuditTrail();
  const updated = [entry, ...existing].slice(0, MAX_ENTRIES);

  await stateClient.setAppState({
    key: AUDIT_STATE_KEY,
    body: { value: JSON.stringify(updated) },
  });
}
