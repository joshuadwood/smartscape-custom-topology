import { useDql } from '@dynatrace-sdk/react-hooks';
import { useMemo } from 'react';
import type { DynatraceEntity, EntityTag } from '../types';

interface UseDqlResult {
  data?: { records?: Record<string, unknown>[] };
  error?: Error;
  isLoading: boolean;
}

/**
 * Sanitize user input for safe interpolation into DQL queries.
 * Strips characters that could break out of a DQL string literal or inject pipeline commands.
 */
function sanitizeDqlInput(input: string): string {
  return input.replace(/["'`|{}()\\;\n\r]/g, '');
}

export function useEntities(entityType: string, searchQuery: string): {
  entities: DynatraceEntity[];
  error: Error | undefined;
  isLoading: boolean;
} {
  const safeSearch = sanitizeDqlInput(searchQuery);
  const filterClause = safeSearch
    ? `| filter contains(toString(entity.name), "${safeSearch}")`
    : '';

  const query = `
    fetch ${entityType}
    | fields id, entity.name, entity.type, entity.detected_name, tags
    ${filterClause}
    | limit 100
  `;

  const { data, error, isLoading } = useDql(query) as UseDqlResult;

  const entities = useMemo<DynatraceEntity[]>(() => {
    if (!data?.records) return [];
    return data.records.map((r) => {
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
  }, [data, entityType]);

  return { entities, error, isLoading };
}
