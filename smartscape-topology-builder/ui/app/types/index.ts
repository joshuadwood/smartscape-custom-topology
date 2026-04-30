export interface DynatraceEntity {
  entityId: string;
  displayName: string;
  type: string;
  tags: EntityTag[];
  properties?: Record<string, unknown>;
}

export interface EntityTag {
  context: string;
  key: string;
  value?: string;
}

export interface EntityRelationship {
  entityId: string;
  type: string;
  direction: 'from' | 'to';
  relatedEntityId: string;
  relatedDisplayName?: string;
  relatedType?: string;
}

export interface CanvasEntity extends DynatraceEntity {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasEdge {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  bidirectional: boolean;
}

export interface TopologyRule {
  sourceEntityId: string;
  sourceDisplayName: string;
  targetEntityId: string;
  targetDisplayName: string;
  relationshipType: string;
  bidirectional: boolean;
}

export type InteractionMode = 'select' | 'connect' | 'pan';

export interface RelationshipEntry {
  fromEntityId: string;
  fromDisplayName: string;
  fromType: string;
  toEntityId: string;
  toDisplayName: string;
  toType: string;
  relationshipType: string;
}

export const ENTITY_TYPES = [
  { id: 'dt.entity.service', label: 'Services', dqlType: 'SERVICE' },
  { id: 'dt.entity.host', label: 'Hosts', dqlType: 'HOST' },
  { id: 'dt.entity.process_group', label: 'Process Groups', dqlType: 'PROCESS_GROUP' },
  { id: 'dt.entity.process_group_instance', label: 'Processes', dqlType: 'PROCESS_GROUP_INSTANCE' },
  { id: 'dt.entity.application', label: 'Applications', dqlType: 'APPLICATION' },
  { id: 'dt.entity.custom_device', label: 'Custom Devices', dqlType: 'CUSTOM_DEVICE' },
  { id: 'dt.entity.cloud_application', label: 'Cloud Apps', dqlType: 'CLOUD_APPLICATION' },
  { id: 'dt.entity.cloud_application_namespace', label: 'K8s Namespaces', dqlType: 'CLOUD_APPLICATION_NAMESPACE' },
  { id: 'dt.entity.kubernetes_cluster', label: 'K8s Clusters', dqlType: 'KUBERNETES_CLUSTER' },
  { id: 'dt.entity.http_check', label: 'HTTP Checks', dqlType: 'HTTP_CHECK' },
  { id: 'dt.entity.synthetic_test', label: 'Synthetics', dqlType: 'SYNTHETIC_TEST' },
] as const;

export const RELATIONSHIP_TYPES = [
  'CALLS',
  'RUNS_ON',
  'CHILD_OF',
  'PART_OF',
  'INSTANCE_OF',
  'SAME_AS',
] as const;

export type RelationshipType = typeof RELATIONSHIP_TYPES[number];

/**
 * A generic entity type definition for Settings > Topology model > Generic types.
 */
export interface GenericTypeDefinition {
  name: string;           // e.g. "custom:azure-load-balancer"
  displayName: string;    // e.g. "Azure Load Balancer"
  enabled: boolean;
  createdBy: string;
  rules: GenericTypeExtractionRule[];
}

export interface GenericTypeExtractionRule {
  idPattern: string;              // e.g. "{resource_id}"
  instanceNamePattern: string;    // e.g. "{resource_name}"
  iconPattern?: string;
  sources: { sourceType: string; condition?: string }[];
  requiredDimensions?: { key: string; valuePattern?: string }[];
  attributes?: { key: string; displayName?: string; pattern: string }[];
  role?: string;
}

/**
 * Full topology rule: type + relationship + metric ingest info.
 */
export interface TopologyCreationPlan {
  /** Generic types to create (if not already existing). */
  genericTypes: GenericTypeDefinition[];
  /** Generic relationships to create. */
  relationships: GenericRelationshipDef[];
  /** Synthetic metric lines to ingest to trigger topology extraction. */
  metricLines: string[];
}

export interface GenericRelationshipDef {
  fromType: string;
  toType: string;
  typeOfRelation: RelationshipType;
  sources: { sourceType: string; condition?: string }[];
  fromRole?: string;
  toRole?: string;
  enabled: boolean;
  createdBy: string;
}

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export interface AuditEdge {
  sourceEntityId: string;
  sourceDisplayName: string;
  sourceType: string;
  targetEntityId: string;
  targetDisplayName: string;
  targetType: string;
  relationshipType: string;
  bidirectional: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  edges: AuditEdge[];
  typesCreated: string[];
  relationshipsCreated: string[];
  metricsIngested: number;
  errors: string[];
  metricErrors: string[];
}
