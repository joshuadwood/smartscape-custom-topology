import { useState, useEffect, useCallback } from 'react';
import { monitoredEntitiesClient } from '@dynatrace-sdk/client-classic-environment-v2';
import type { RelationshipEntry } from '../types';

interface ApiEntity {
  entityId: string;
  displayName: string;
  type: string;
  fromRelationships?: Record<string, { id: string }[]>;
  toRelationships?: Record<string, { id: string }[]>;
}

/**
 * Resolve display names for entity IDs we only see as relationship targets.
 * Batches up to 50 IDs per call.
 */
async function resolveEntityNames(entityIds: string[]): Promise<Map<string, { displayName: string; type: string }>> {
  const result = new Map<string, { displayName: string; type: string }>();
  if (entityIds.length === 0) return result;

  const batches: string[][] = [];
  for (let i = 0; i < entityIds.length; i += 50) {
    batches.push(entityIds.slice(i, i + 50));
  }

  for (const batch of batches) {
    const selector = batch.map((id) => `entityId("${id}")`).join(',');
    try {
      const data = await monitoredEntitiesClient.getEntities({
        entitySelector: selector,
        pageSize: batch.length,
      });
      for (const entity of data.entities ?? []) {
        if (!entity.entityId) continue;
        result.set(entity.entityId, {
          displayName: entity.displayName ?? entity.entityId,
          type: entity.type ?? 'UNKNOWN',
        });
      }
    } catch {
      // Fallback: IDs will remain as display names
    }
  }
  return result;
}

export function useRelationships(entityTypeSelector: string) {
  const [relationships, setRelationships] = useState<RelationshipEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  const fetchRelationships = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const allEntities: ApiEntity[] = [];
      let nextPageKey: string | undefined;

      // Paginate through all results
      do {
        const config: Record<string, unknown> = {
          entitySelector: `type("${entityTypeSelector}")`,
          fields: '+fromRelationships,+toRelationships',
          pageSize: 50,
        };
        if (nextPageKey) config.nextPageKey = nextPageKey;

        const data = await monitoredEntitiesClient.getEntities(config as Parameters<typeof monitoredEntitiesClient.getEntities>[0]);
        const entities = (data.entities ?? []) as unknown as ApiEntity[];
        allEntities.push(...entities);
        nextPageKey = data.nextPageKey ?? undefined;
      } while (nextPageKey);

      // Collect all unresolved entity IDs (from relationship targets)
      const unresolvedIds = new Set<string>();
      const entries: RelationshipEntry[] = [];

      for (const entity of allEntities) {
        for (const [relType, relEntities] of Object.entries(entity.fromRelationships ?? {})) {
          for (const rel of relEntities) {
            const relId = rel.id ?? (rel as unknown as { entityId: string }).entityId;
            unresolvedIds.add(relId);
            entries.push({
              fromEntityId: entity.entityId,
              fromDisplayName: entity.displayName,
              fromType: entity.type,
              toEntityId: relId,
              toDisplayName: relId, // placeholder
              toType: relId.split('-')[0] ?? 'UNKNOWN',
              relationshipType: relType,
            });
          }
        }
        for (const [relType, relEntities] of Object.entries(entity.toRelationships ?? {})) {
          for (const rel of relEntities) {
            const relId = rel.id ?? (rel as unknown as { entityId: string }).entityId;
            unresolvedIds.add(relId);
            entries.push({
              fromEntityId: relId,
              fromDisplayName: relId, // placeholder
              fromType: relId.split('-')[0] ?? 'UNKNOWN',
              toEntityId: entity.entityId,
              toDisplayName: entity.displayName,
              toType: entity.type,
              relationshipType: relType,
            });
          }
        }
      }

      // Resolve display names for all referenced entity IDs
      const resolved = await resolveEntityNames(Array.from(unresolvedIds));
      for (const entry of entries) {
        const fromInfo = resolved.get(entry.fromEntityId);
        if (fromInfo) {
          entry.fromDisplayName = fromInfo.displayName;
          entry.fromType = fromInfo.type;
        }
        const toInfo = resolved.get(entry.toEntityId);
        if (toInfo) {
          entry.toDisplayName = toInfo.displayName;
          entry.toType = toInfo.type;
        }
      }

      setRelationships(entries);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [entityTypeSelector]);

  useEffect(() => {
    void fetchRelationships();
  }, [fetchRelationships]);

  return { relationships, isLoading, error, refresh: fetchRelationships };
}
