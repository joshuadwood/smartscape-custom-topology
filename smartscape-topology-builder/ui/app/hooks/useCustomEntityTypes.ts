import { useState, useEffect } from 'react';
import { settingsObjectsClient } from '@dynatrace-sdk/client-classic-environment-v2';

export interface CustomEntityType {
  id: string;
  label: string;
  dqlType: string;
}

/**
 * Discovers custom entity types defined via builtin:monitoredentities.generic.type settings.
 * These are Smartscape 2.0 entity types that don't appear in the static ENTITY_TYPES list.
 */
export function useCustomEntityTypes(): {
  customTypes: CustomEntityType[];
  isLoading: boolean;
  error: Error | undefined;
} {
  const [customTypes, setCustomTypes] = useState<CustomEntityType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function fetchCustomTypes() {
      try {
        const result = await settingsObjectsClient.getSettingsObjects({
          schemaIds: 'builtin:monitoredentities.generic.type',
          pageSize: 500,
          fields: 'objectId,value',
        });

        if (cancelled) return;

        const types: CustomEntityType[] = [];
        for (const item of result.items ?? []) {
          const value = item.value as Record<string, unknown> | undefined;
          if (!value) continue;

          const name = value.name as string | undefined;
          const displayName = value.displayName as string | undefined;
          const enabled = value.enabled as boolean | undefined;

          if (!name || enabled === false) continue;

          // Generic type names are like "custom:my_type" -> entity type is "dt.entity.custom:my_type"
          // Or they could be just "my_type" -> "dt.entity.my_type"
          const entityTypeId = name.includes(':')
            ? `dt.entity.${name}`
            : `dt.entity.${name}`;

          types.push({
            id: entityTypeId,
            label: displayName || name,
            dqlType: name.toUpperCase().replace(/[:-]/g, '_'),
          });
        }

        setCustomTypes(types);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchCustomTypes();
    return () => { cancelled = true; };
  }, []);

  return { customTypes, isLoading, error };
}
