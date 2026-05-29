import { useDql } from '@dynatrace-sdk/react-hooks';
import { entitiesClient } from '@dynatrace-sdk/client-classic-environment-v2';
import { useState, useEffect, useMemo } from 'react';
import type { DynatraceEntity, EntityTag } from '../types';

interface UseDqlResult {
  data?: { records?: Record<string, unknown>[] };
  error?: Error;
  isLoading: boolean;
}

function sanitizeDqlInput(input: string): string {
  return input.replace(/["'`|{}()\\;\n\r]/g, '');
}

function sanitizeSelector(input: string): string {
  return input.replace(/["\\]/g, '');
}

/**
 * Derive the entity selector type from the DQL entity type ID.
 * "dt.entity.service"                → "SERVICE"
 * "dt.entity.process_group"          → "PROCESS_GROUP"
 * "dt.entity.custom:topology_bridge" → "custom:topology_bridge"
 */
function getSelectorType(entityTypeId: string): string {
  const stripped = entityTypeId.startsWith('dt.entity.')
    ? entityTypeId.slice('dt.entity.'.length)
    : entityTypeId;
  return stripped.includes(':') ? stripped : stripped.toUpperCase();
}

export function useEntities(entityType: string, searchQuery: string): {
  entities: DynatraceEntity[];
  error: Error | undefined;
  isLoading: boolean;
} {
  const isCustomType = entityType.includes(':');

  // ── DQL path for built-in entity types ──────────────────────────────────
  // useDql must always be called (React rules of hooks).
  // For custom types we fire a cheap no-op so the hook stays in the call order.
  const safeSearch = sanitizeDqlInput(searchQuery);
  const filterClause = safeSearch
    ? `| filter contains(toString(entity.name), "${safeSearch}")`
    : '';
  const dqlQuery = isCustomType
    ? 'fetch dt.entity.service | fields id | limit 1'
    : `
    fetch ${entityType}
    | fields id, entity.name, entity.type, entity.detected_name, tags
    ${filterClause}
    | limit 100
  `;
  const { data: dqlData, error: dqlError, isLoading: dqlLoading } = useDql(dqlQuery) as UseDqlResult;

  const dqlEntities = useMemo<DynatraceEntity[]>(() => {
    if (isCustomType || !dqlData?.records) return [];
    return dqlData.records.map((r) => {
      const rawTags = r['tags'];
      let tags: EntityTag[] = [];
      if (Array.isArray(rawTags)) {
        tags = rawTags.map((t: unknown) => {
          if (typeof t === 'object' && t !== null) {
            const tag = t as Record<string, unknown>;
            return {
              context: String(tag['context'] ?? 'CONTEXTLESS'),
              key: String(tag['key'] ?? ''),
              value: tag['value'] != null ? String(tag['value']) : undefined,
            };
          }
          return { context: 'CONTEXTLESS', key: String(t), value: undefined };
        });
      }
      return {
        entityId: String(r['id'] ?? ''),
        displayName: String(r['entity.name'] ?? r['entity.detected_name'] ?? r['id'] ?? ''),
        type: String(r['entity.type'] ?? entityType.replace('dt.entity.', '').toUpperCase()),
        tags,
        properties: {},
      };
    });
  }, [dqlData, isCustomType, entityType]);

  // ── Entity API path for custom/generic entity types ──────────────────────
  // useState/useEffect must also always be called.
  const [apiEntities, setApiEntities] = useState<DynatraceEntity[]>([]);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<Error | undefined>();

  const selectorType = getSelectorType(entityType);
  const safeNameFilter = sanitizeSelector(searchQuery);

  useEffect(() => {
    if (!isCustomType) return;
    let cancelled = false;
    setApiLoading(true);
    setApiError(undefined);

    const selector = safeNameFilter
      ? `type("${selectorType}"),entityName.contains("${safeNameFilter}")`
      : `type("${selectorType}")`;

    entitiesClient
      .getEntities({ entitySelector: selector, fields: '+tags', pageSize: 100 })
      .then((result) => {
        if (cancelled) return;
        setApiEntities(
          (result.entities ?? []).map((e) => ({
            entityId: e.entityId ?? '',
            displayName: e.displayName ?? e.entityId ?? '',
            type: e.type ?? selectorType,
            tags: (e.tags ?? []).map((t) => ({
              context: t.context ?? 'CONTEXTLESS',
              key: t.key ?? '',
              value: t.value != null ? String(t.value) : undefined,
            })) as EntityTag[],
            properties: {},
          }))
        );
      })
      .catch((err) => {
        if (!cancelled) setApiError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setApiLoading(false);
      });

    return () => { cancelled = true; };
  }, [isCustomType, selectorType, safeNameFilter]);

  if (isCustomType) {
    return { entities: apiEntities, error: apiError, isLoading: apiLoading };
  }
  return { entities: dqlEntities, error: dqlError, isLoading: dqlLoading };
}
