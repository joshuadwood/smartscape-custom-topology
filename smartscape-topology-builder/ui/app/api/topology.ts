import {
  settingsObjectsClient,
  settingsSchemasClient,
} from '@dynatrace-sdk/client-classic-environment-v2';
import { functions } from '@dynatrace-sdk/app-utils';
import type {
  TopologyRule,
  RelationshipType,
  GenericTypeDefinition,
  GenericRelationshipDef,
  TopologyCreationPlan,
} from '../types';

// Schema IDs
const GENERIC_TYPE_SCHEMA = 'builtin:monitoredentities.generic.type';
const GENERIC_RELATION_SCHEMA = 'builtin:monitoredentities.generic.relation';
const CREATED_BY = 'Smartscape Topology Builder App';

// ─── Error helpers ───────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const e = err as Error & { body?: unknown; statusCode?: number };
    const parts: string[] = [];
    if (e.statusCode) parts.push(`HTTP ${e.statusCode}`);
    if (e.message) parts.push(e.message);
    if (e.body) {
      try {
        const bodyStr = typeof e.body === 'string' ? e.body : JSON.stringify(e.body, null, 2);
        parts.push(`Response body:\n${bodyStr}`);
      } catch { /* ignore */ }
    }
    return parts.join('\n') || 'Unknown error';
  }
  try {
    return JSON.stringify(err, null, 2);
  } catch {
    return String(err);
  }
}

// ─── Entity type helpers ─────────────────────────────────────────────────────

/**
 * Extract the entity type prefix from an entity ID.
 * e.g. "SERVICE-12345ABC" → "service", "CUSTOM_DEVICE-XYZ" → "custom_device"
 */
export function extractEntityType(entityId: string): string {
  const idx = entityId.indexOf('-');
  return (idx > 0 ? entityId.substring(0, idx) : entityId).toLowerCase();
}

/**
 * Known built-in entity types that cannot be used in generic relations alone.
 */
const BUILTIN_TYPES = new Set([
  'service', 'host', 'process_group', 'process_group_instance',
  'application', 'http_check', 'synthetic_test', 'custom_device',
  'cloud_application', 'cloud_application_instance', 'cloud_application_namespace',
  'kubernetes_cluster', 'kubernetes_node', 'kubernetes_service',
]);

export function isBuiltinType(typeName: string): boolean {
  return BUILTIN_TYPES.has(typeName.toLowerCase());
}

/**
 * Map our relationship type string to the Settings schema enum value.
 */
function mapRelationType(relType: string): string {
  const map: Record<string, string> = {
    RUNS_ON: 'RUNS_ON',
    CALLS: 'CALLS',
    CHILD_OF: 'CHILD_OF',
    PART_OF: 'PART_OF',
    INSTANCE_OF: 'INSTANCE_OF',
    SAME_AS: 'SAME_AS',
  };
  return map[relType] ?? 'CALLS';
}

// ─── Generic type management ─────────────────────────────────────────────────

/**
 * List all existing generic entity types in the environment.
 */
export async function listGenericTypes(): Promise<Array<{ objectId: string; name: string; displayName: string; createdBy: string }>> {
  const result = await settingsObjectsClient.getSettingsObjects({
    schemaIds: GENERIC_TYPE_SCHEMA,
    scopes: 'environment',
    pageSize: 500,
  });
  return (result.items ?? []).map((obj) => {
    const v = obj.value as Record<string, unknown>;
    return {
      objectId: obj.objectId ?? '',
      name: String(v.name ?? ''),
      displayName: String(v.displayName ?? ''),
      createdBy: String(v.createdBy ?? ''),
    };
  });
}

/**
 * List all existing generic relationship rules in the environment.
 * Used for deduplication checks.
 */
export async function listGenericRelationships(): Promise<Array<{
  objectId: string;
  fromType: string;
  toType: string;
  typeOfRelation: string;
  createdBy: string;
}>> {
  const result = await settingsObjectsClient.getSettingsObjects({
    schemaIds: GENERIC_RELATION_SCHEMA,
    scopes: 'environment',
    pageSize: 500,
  });
  return (result.items ?? []).map((obj) => {
    const v = obj.value as Record<string, unknown>;
    return {
      objectId: obj.objectId ?? '',
      fromType: String(v.fromType ?? ''),
      toType: String(v.toType ?? ''),
      typeOfRelation: String(v.typeOfRelation ?? ''),
      createdBy: String(v.createdBy ?? ''),
    };
  });
}

/**
 * Create a generic entity type via Settings API.
 */
export async function createGenericType(typeDef: GenericTypeDefinition): Promise<string> {
  const value = {
    name: typeDef.name,
    displayName: typeDef.displayName,
    enabled: typeDef.enabled,
    createdBy: typeDef.createdBy,
    rules: typeDef.rules.map((rule) => ({
      idPattern: rule.idPattern,
      instanceNamePattern: rule.instanceNamePattern,
      iconPattern: rule.iconPattern ?? 'default',
      sources: rule.sources.map((s) => {
        const src: Record<string, string> = { sourceType: s.sourceType };
        if (s.condition) src.condition = s.condition;
        return src;
      }),
      requiredDimensions: rule.requiredDimensions ?? [],
      attributes: (rule.attributes ?? []).map((a) => ({
        key: a.key,
        displayName: a.displayName ?? a.key,
        pattern: a.pattern,
      })),
      role: rule.role ?? 'default',
    })),
  };

  let response;
  try {
    response = await settingsObjectsClient.postSettingsObjects({
      body: [{
        schemaId: GENERIC_TYPE_SCHEMA,
        scope: 'environment',
        value,
      }],
    });
  } catch (err) {
    throw new Error(`Failed to create generic type "${typeDef.name}":\n${extractErrorMessage(err)}`);
  }

  const failures = response.filter((r) => r.code !== undefined && r.code >= 400);
  if (failures.length > 0) {
    const msg = failures.map((f) => {
      const parts = [`HTTP ${f.code}`];
      if (f.error?.message) parts.push(f.error.message);
      if (f.error?.constraintViolations?.length) {
        for (const cv of f.error.constraintViolations) {
          parts.push(`  - ${cv.path ?? ''}: ${cv.message ?? ''}`);
        }
      }
      return parts.join('\n');
    }).join('\n---\n');
    throw new Error(`Failed to create generic type "${typeDef.name}":\n${msg}`);
  }

  return response[0]?.objectId ?? '';
}

// ─── Generic relationship management ─────────────────────────────────────────

/**
 * Create a generic relationship rule via Settings API.
 */
export async function createGenericRelationship(relDef: GenericRelationshipDef): Promise<string> {
  const value: Record<string, unknown> = {
    enabled: relDef.enabled,
    createdBy: relDef.createdBy,
    fromType: relDef.fromType,
    toType: relDef.toType,
    typeOfRelation: mapRelationType(relDef.typeOfRelation),
    sources: relDef.sources.map((s) => {
      const src: Record<string, string> = { sourceType: s.sourceType };
      if (s.condition) src.condition = s.condition;
      return src;
    }),
  };
  if (relDef.fromRole) value.fromRole = relDef.fromRole;
  if (relDef.toRole) value.toRole = relDef.toRole;

  let response;
  try {
    response = await settingsObjectsClient.postSettingsObjects({
      body: [{
        schemaId: GENERIC_RELATION_SCHEMA,
        scope: 'environment',
        value,
      }],
    });
  } catch (err) {
    throw new Error(
      `Failed to create relationship ${relDef.fromType} → ${relDef.toType}:\n${extractErrorMessage(err)}`
    );
  }

  const failures = response.filter((r) => r.code !== undefined && r.code >= 400);
  if (failures.length > 0) {
    const msg = failures.map((f) => {
      const parts = [`HTTP ${f.code}`];
      if (f.error?.message) parts.push(f.error.message);
      if (f.error?.constraintViolations?.length) {
        for (const cv of f.error.constraintViolations) {
          parts.push(`  - ${cv.path ?? ''}: ${cv.message ?? ''}`);
        }
      }
      return parts.join('\n');
    }).join('\n---\n');
    throw new Error(`Failed to create relationship ${relDef.fromType} → ${relDef.toType}:\n${msg}`);
  }

  return response[0]?.objectId ?? '';
}

// ─── Metric ingest ───────────────────────────────────────────────────────────

// ─── Topology entity push ────────────────────────────────────────────────────

/**
 * Push custom device bridge entities to create visible topology in Smartscape.
 * Uses the Custom Device API (environment-api:entities:write) which IS available
 * on this environment, unlike storage:metrics:write.
 */
export async function pushTopologyBridges(rules: TopologyRule[]): Promise<void> {
  if (rules.length === 0) return;

  const edges = rules.map((rule) => ({
    sourceEntityId: rule.sourceEntityId,
    sourceDisplay: rule.sourceDisplayName,
    targetEntityId: rule.targetEntityId,
    targetDisplay: rule.targetDisplayName,
    relationType: rule.relationshipType,
    bidirectional: rule.bidirectional,
  }));

  try {
    const response = await functions.call('push-topology', {
      data: { edges },
    });
    const result = await response.json() as { success: boolean; errors?: string[] };
    if (!result.success) {
      throw new Error(result.errors?.join('\n') ?? 'Unknown error from backend function');
    }
  } catch (err) {
    throw new Error(`Bridge entity push failed:\n${extractErrorMessage(err)}`);
  }
}

/**
 * Ingest topology metrics via backend app function.
 * Uses an auto-provisioned API token with metrics.ingest scope to bypass
 * OAuth storage:metrics:write restrictions. The extraction engine processes
 * metrics matching $prefix() conditions to create/update entities and relationships.
 */
export async function ingestMetrics(metricLines: string[]): Promise<void> {
  if (metricLines.length === 0) return;

  try {
    const response = await functions.call('ingest-metrics-v3', {
      data: { metricLines },
    });
    const result = await response.json() as { success: boolean; count?: number; linesOk?: number; linesInvalid?: number; method?: string; error?: string; detail?: string };
    if (!result.success) {
      throw new Error(result.error ?? 'Unknown error from backend function');
    }
    console.log(`Metrics ingested: ${result.linesOk ?? result.count} lines OK via ${result.method}` +
      (result.linesInvalid ? ` (${result.linesInvalid} invalid)` : '') +
      (result.detail ? ` — ${result.detail}` : ''));
  } catch (err) {
    throw new Error(`Metric ingest failed:\n${extractErrorMessage(err)}`);
  }
}

/**
 * Ingest OTLP traces to create direct service→service CALLS relationships.
 * Smartscape 2.0 service-overview only renders SERVICE nodes, so the bridge
 * entity (CUSTOM_DEVICE) is invisible there. By injecting a minimal trace
 * with CLIENT→SERVER spans tied to real entity IDs via `dt.entity.service`
 * resource attributes, we create a natural CALLS edge between services.
 */
async function ingestTopologyTraces(
  rules: TopologyRule[],
): Promise<{ success: boolean; edgesProcessed: number; detail?: string }> {
  const edges = rules.map((r) => ({
    sourceEntityId: r.sourceEntityId,
    sourceDisplayName: r.sourceDisplayName,
    targetEntityId: r.targetEntityId,
    targetDisplayName: r.targetDisplayName,
    relationType: r.relationshipType,
    bidirectional: r.bidirectional,
  }));

  try {
    const response = await functions.call('ingest-topology-trace', {
      data: { edges },
    });
    const result = await response.json() as {
      success: boolean;
      edgesProcessed: number;
      method?: string;
      error?: string;
      detail?: string;
    };
    if (!result.success) {
      throw new Error(result.error ?? 'Trace ingest failed');
    }
    console.log(`Topology traces ingested: ${result.edgesProcessed} edges via ${result.method}`);
    return result;
  } catch (err) {
    throw new Error(`Trace ingest failed:\n${extractErrorMessage(err)}`);
  }
}

// ─── Bridge type for built-in↔built-in connections ──────────────────────────

const BRIDGE_TYPE_NAME = 'custom:topology_bridge';
const BRIDGE_DISPLAY_NAME = 'Topology Bridge';
const BRIDGE_METRIC_PREFIX = 'custom.topology.bridge';

/**
 * Check if the bridge generic type needs to be created.
 */
function needsBridgeType(existingNames: Set<string>, newNames: Set<string>): boolean {
  return !existingNames.has(BRIDGE_TYPE_NAME) && !newNames.has(BRIDGE_TYPE_NAME);
}

/**
 * Create the bridge generic type definition.
 * The bridge is a lightweight proxy entity that enables relationships
 * between two built-in entity types.
 *
 * Uses $prefix(custom.topology.bridge) so the extraction engine associates
 * ALL bridge metrics (main, .from, .to) with the bridge entity. This is
 * critical: the relationship extraction needs the .from/.to metrics to be
 * associated with the bridge type so it can identify both endpoints
 * (bridge via type extraction + built-in via dt.entity.* dimension).
 */
function buildBridgeTypeDef(): GenericTypeDefinition {
  return {
    name: BRIDGE_TYPE_NAME,
    displayName: BRIDGE_DISPLAY_NAME,
    enabled: true,
    createdBy: CREATED_BY,
    rules: [{
      idPattern: '{bridge_id}',
      instanceNamePattern: '{bridge_name}',
      sources: [{ sourceType: 'Metrics', condition: '$prefix(custom.topology.bridge)' }],
      requiredDimensions: [
        { key: 'bridge_id', valuePattern: '$exists()' },
      ],
      attributes: [
        { key: 'bridge_name', displayName: 'Bridge Name', pattern: '{bridge_name}' },
        { key: 'source_entity', displayName: 'Source Entity', pattern: '{source_entity}' },
        { key: 'target_entity', displayName: 'Target Entity', pattern: '{target_entity}' },
      ],
    }],
  };
}

// ─── Topology creation plan builder ──────────────────────────────────────────

/**
 * Sanitize a value for use as a MINT protocol dimension value.
 * Escapes double quotes, backslashes, and strips newlines to prevent injection.
 */
function sanitizeMetricDimension(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\n\r]/g, ' ');
}

/**
 * Build a metric key for a custom topology link metric.
 */
function buildMetricKey(fromType: string, toType: string): string {
  const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `custom.topology.link.${sanitize(fromType)}.to.${sanitize(toType)}`;
}

/**
 * Check whether a given edge will use the bridge pattern.
 * Returns true when both source and target are built-in types.
 */
export function edgeNeedsBridge(sourceEntityId: string, targetEntityId: string): boolean {
  return isBuiltinType(extractEntityType(sourceEntityId)) &&
         isBuiltinType(extractEntityType(targetEntityId));
}

/**
 * Build a complete topology creation plan from canvas edges.
 * This determines which generic types need to be created and which already exist.
 *
 * When both sides of an edge are built-in types, a "topology bridge" generic
 * entity is inserted automatically:
 *   source (built-in) → bridge (generic) → target (built-in)
 */
export async function buildTopologyPlan(
  rules: TopologyRule[],
  existingGenericTypeNames: Set<string>,
): Promise<TopologyCreationPlan> {
  const genericTypes: GenericTypeDefinition[] = [];
  const relationships: GenericRelationshipDef[] = [];
  const metricLines: string[] = [];
  const newTypeNames = new Set<string>();

  for (const rule of rules) {
    const sourceType = extractEntityType(rule.sourceEntityId);
    const targetType = extractEntityType(rule.targetEntityId);
    const sourceIsBuiltin = isBuiltinType(sourceType);
    const targetIsBuiltin = isBuiltinType(targetType);

    if (sourceIsBuiltin && targetIsBuiltin) {
      // ── Bridge pattern: insert a generic bridge entity between two built-in types ──
      // dt.entity.* dimension values MUST be real Dynatrace entity IDs. We can't
      // reference the bridge by raw id in dt.entity.custom:topology_bridge because
      // the bridge entity hasn't been created yet and a raw string isn't a valid ID.
      //
      // Instead, we put dt.entity.{builtinType} on directional bridge metrics
      // (.from and .to). The extraction engine resolves the bridge from the metric's
      // own entity context (matching $prefix) and reads the built-in entity from
      // the dt.entity.* dimension to create the relationship.
      if (needsBridgeType(existingGenericTypeNames, newTypeNames)) {
        genericTypes.push(buildBridgeTypeDef());
        newTypeNames.add(BRIDGE_TYPE_NAME);
      }

      // Stable bridge ID derived from source+target so re-runs are idempotent
      const bridgeId = `bridge-${sourceType}-${targetType}-${rule.sourceEntityId}-${rule.targetEntityId}`
        .replace(/[^a-zA-Z0-9._-]/g, '_');
      const bridgeName = sanitizeMetricDimension(`${rule.sourceDisplayName} ↔ ${rule.targetDisplayName}`);

      // 1) Main bridge entity metric — creates the bridge entity via $eq(custom.topology.bridge)
      metricLines.push(
        `${BRIDGE_METRIC_PREFIX},bridge_id="${bridgeId}",bridge_name="${bridgeName}",source_entity="${sanitizeMetricDimension(rule.sourceEntityId)}",target_entity="${sanitizeMetricDimension(rule.targetEntityId)}" gauge,1`
      );

      // 2) Source→bridge metric: carries dt.entity.{sourceType} for the relationship
      //    Extraction: sourceType → custom:topology_bridge
      relationships.push({
        fromType: sourceType,
        toType: BRIDGE_TYPE_NAME,
        typeOfRelation: rule.relationshipType as RelationshipType,
        sources: [{ sourceType: 'Metrics', condition: `$prefix(${BRIDGE_METRIC_PREFIX}.from)` }],
        enabled: true,
        createdBy: CREATED_BY,
      });
      metricLines.push(
        `${BRIDGE_METRIC_PREFIX}.from,bridge_id="${bridgeId}",dt.entity.${sourceType}="${rule.sourceEntityId}" gauge,1`
      );

      // 3) Bridge→target metric: carries dt.entity.{targetType} for the relationship
      //    Extraction: custom:topology_bridge → targetType
      relationships.push({
        fromType: BRIDGE_TYPE_NAME,
        toType: targetType,
        typeOfRelation: rule.relationshipType as RelationshipType,
        sources: [{ sourceType: 'Metrics', condition: `$prefix(${BRIDGE_METRIC_PREFIX}.to)` }],
        enabled: true,
        createdBy: CREATED_BY,
      });
      metricLines.push(
        `${BRIDGE_METRIC_PREFIX}.to,bridge_id="${bridgeId}",dt.entity.${targetType}="${rule.targetEntityId}" gauge,1`
      );

      // Bidirectional: also create target → bridge → source (reverse path)
      if (rule.bidirectional) {
        // target → bridge
        relationships.push({
          fromType: targetType,
          toType: BRIDGE_TYPE_NAME,
          typeOfRelation: rule.relationshipType as RelationshipType,
          sources: [{ sourceType: 'Metrics', condition: `$prefix(${BRIDGE_METRIC_PREFIX}.from)` }],
          enabled: true,
          createdBy: CREATED_BY,
        });
        metricLines.push(
          `${BRIDGE_METRIC_PREFIX}.from,bridge_id="${bridgeId}",dt.entity.${targetType}="${rule.targetEntityId}" gauge,1`
        );

        // bridge → source
        relationships.push({
          fromType: BRIDGE_TYPE_NAME,
          toType: sourceType,
          typeOfRelation: rule.relationshipType as RelationshipType,
          sources: [{ sourceType: 'Metrics', condition: `$prefix(${BRIDGE_METRIC_PREFIX}.to)` }],
          enabled: true,
          createdBy: CREATED_BY,
        });
        metricLines.push(
          `${BRIDGE_METRIC_PREFIX}.to,bridge_id="${bridgeId}",dt.entity.${sourceType}="${rule.sourceEntityId}" gauge,1`
        );
      }

      continue; // skip the normal (non-bridge) path below
    }

    // ── Normal path: at least one side is non-builtin ──
    for (const typeName of [sourceType, targetType]) {
      if (!isBuiltinType(typeName) && !existingGenericTypeNames.has(typeName) && !newTypeNames.has(typeName)) {
        const metricKey = `custom.topology.entity.${typeName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        genericTypes.push({
          name: typeName,
          displayName: typeName.split(':').pop()?.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? typeName,
          enabled: true,
          createdBy: CREATED_BY,
          rules: [{
            idPattern: `{entity_id}`,
            instanceNamePattern: `{entity_name}`,
            sources: [{ sourceType: 'Metrics', condition: '$prefix(custom.topology.entity)' }],
            requiredDimensions: [
              { key: 'entity_id', valuePattern: '$exists()' },
            ],
            attributes: [
              { key: 'entity_name', displayName: 'Entity Name', pattern: '{entity_name}' },
            ],
          }],
        });
        newTypeNames.add(typeName);
      }
    }

    // Build the relationship
    const metricKey = buildMetricKey(sourceType, targetType);
    relationships.push({
      fromType: sourceType,
      toType: targetType,
      typeOfRelation: rule.relationshipType as RelationshipType,
      sources: [{ sourceType: 'Metrics', condition: '$prefix(custom.topology.link)' }],
      enabled: true,
      createdBy: CREATED_BY,
    });

    metricLines.push(
      `${metricKey},dt.entity.${sourceType}="${rule.sourceEntityId}",dt.entity.${targetType}="${rule.targetEntityId}" gauge,1`
    );

    // Handle bidirectional — create the reverse relationship too
    if (rule.bidirectional) {
      const reverseMetricKey = buildMetricKey(targetType, sourceType);
      relationships.push({
        fromType: targetType,
        toType: sourceType,
        typeOfRelation: rule.relationshipType as RelationshipType,
        sources: [{ sourceType: 'Metrics', condition: '$prefix(custom.topology.link)' }],
        enabled: true,
        createdBy: CREATED_BY,
      });
      metricLines.push(
        `${reverseMetricKey},dt.entity.${targetType}="${rule.targetEntityId}",dt.entity.${sourceType}="${rule.sourceEntityId}" gauge,1`
      );
    }
  }

  return { genericTypes, relationships, metricLines };
}

// ─── Execute the full plan ───────────────────────────────────────────────────

export interface PlanExecutionResult {
  typesCreated: string[];
  relationshipsCreated: string[];
  metricsIngested: number;
  errors: string[];
  /** Metric ingest errors (non-blocking — types & relationships still created) */
  metricErrors: string[];
  /** Metric lines that failed to ingest — can be retried or copied */
  pendingMetricLines: string[];
  /** Number of OTLP trace spans ingested for direct service→service edges */
  tracesIngested: number;
  /** Trace ingest errors (non-blocking) */
  traceErrors: string[];
}

/**
 * Execute a topology creation plan step by step:
 * 1. Create generic types (if any)
 * 2. Create generic relationships
 * 3. Ingest synthetic metrics
 * 4. Ingest OTLP traces for direct service→service edges (Smartscape 2.0)
 */
export async function executePlan(
  plan: TopologyCreationPlan,
  onProgress?: (step: string) => void,
  rules?: TopologyRule[],
): Promise<PlanExecutionResult> {
  const result: PlanExecutionResult = {
    typesCreated: [],
    relationshipsCreated: [],
    metricsIngested: 0,
    errors: [],
    metricErrors: [],
    pendingMetricLines: [],
    tracesIngested: 0,
    traceErrors: [],
  };

  // Pre-fetch existing relationships for dedup
  let existingRels: Array<{ fromType: string; toType: string; typeOfRelation: string }> = [];
  try {
    onProgress?.('Checking for existing rules...');
    existingRels = await listGenericRelationships();
  } catch {
    // Non-blocking: if we can't check, proceed without dedup
  }
  const relKey = (from: string, to: string, rel: string) =>
    `${from.toLowerCase()}|${to.toLowerCase()}|${rel}`;
  const existingRelSet = new Set(existingRels.map((r) => relKey(r.fromType, r.toType, r.typeOfRelation)));

  // Step 1: Create generic types
  for (const typeDef of plan.genericTypes) {
    onProgress?.(`Creating generic type: ${typeDef.name}...`);
    try {
      const objectId = await createGenericType(typeDef);
      result.typesCreated.push(typeDef.name);
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Step 2: Create generic relationships (with dedup)
  for (const relDef of plan.relationships) {
    const key = relKey(relDef.fromType, relDef.toType, relDef.typeOfRelation);
    if (existingRelSet.has(key)) {
      onProgress?.(`Skipping duplicate: ${relDef.fromType} → ${relDef.toType} (${relDef.typeOfRelation} already exists)`);
      continue;
    }
    onProgress?.(`Creating relationship: ${relDef.fromType} → ${relDef.toType}...`);
    try {
      const objectId = await createGenericRelationship(relDef);
      result.relationshipsCreated.push(`${relDef.fromType} → ${relDef.toType}`);
      existingRelSet.add(key); // Mark as created for next iteration
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  // Step 3: Ingest metrics (tries multiple methods via backend function)
  if (plan.metricLines.length > 0) {
    onProgress?.(`Ingesting ${plan.metricLines.length} metric(s) for extraction...`);
    try {
      await ingestMetrics(plan.metricLines);
      result.metricsIngested = plan.metricLines.length;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.metricErrors.push(`Metric ingest: ${msg}`);
      result.pendingMetricLines = [...plan.metricLines];
    }
  }

  // Step 4: Ingest OTLP traces for direct service→service CALLS edges
  // This makes the relationship visible in Smartscape 2.0 service-overview,
  // which only renders SERVICE nodes (bridge entities are invisible there).
  if (rules && rules.length > 0) {
    onProgress?.('Ingesting topology traces for Smartscape visibility...');
    try {
      const traceResult = await ingestTopologyTraces(rules);
      result.tracesIngested = traceResult.edgesProcessed;
      if (traceResult.detail) {
        result.traceErrors.push(traceResult.detail);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.traceErrors.push(`Trace ingest: ${msg}`);
    }
  }

  return result;
}

// ─── Legacy compat exports ───────────────────────────────────────────────────

/**
 * Get existing topology relationship rules created by this app.
 */
export async function getExistingTopologyRules() {
  const result = await settingsObjectsClient.getSettingsObjects({
    schemaIds: GENERIC_RELATION_SCHEMA,
    scopes: 'environment',
    pageSize: 100,
  });
  return (result.items ?? []).filter(
    (obj) => (obj.value as Record<string, unknown>)?.createdBy === CREATED_BY
  );
}

/**
 * Fetch schema definitions for debugging.
 */
export async function fetchSchemaDefinition(schemaId: string = GENERIC_RELATION_SCHEMA): Promise<unknown> {
  try {
    return await settingsSchemasClient.getSchemaDefinition({ schemaId });
  } catch (err) {
    return { error: extractErrorMessage(err) };
  }
}

/**
 * Build a preview of the plan for the UI.
 */
export function buildRulePreview(rules: TopologyRule[]): object[] {
  // This is for the old-style preview — will be replaced by plan preview
  return rules.map((rule) => ({
    from: rule.sourceEntityId,
    to: rule.targetEntityId,
    type: rule.relationshipType,
    bidirectional: rule.bidirectional,
  }));
}
