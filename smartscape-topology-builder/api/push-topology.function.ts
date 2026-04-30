import { monitoredEntitiesClient } from '@dynatrace-sdk/client-classic-environment-v2';

interface TopologyEdge {
  sourceEntityId: string;
  sourceDisplay: string;
  targetEntityId: string;
  targetDisplay: string;
  relationType: string;
  bidirectional: boolean;
}

interface PushPayload {
  edges: TopologyEdge[];
}

/**
 * Create custom device bridge entities with topology context.
 * Each edge gets a CUSTOM_DEVICE entity that bridges source ↔ target.
 * Relationships are established via DNS name matching for auto-discovery.
 */
export default async function (payload: PushPayload): Promise<{
  success: boolean;
  created: string[];
  errors: string[];
}> {
  const { edges } = payload ?? {};

  if (!edges || !Array.isArray(edges) || edges.length === 0) {
    return { success: false, created: [], errors: ['No edges provided'] };
  }

  const created: string[] = [];
  const errors: string[] = [];

  for (const edge of edges) {
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_');
    const deviceId = `topo-bridge-${sanitize(edge.sourceEntityId)}-${sanitize(edge.targetEntityId)}`;
    const displayName = edge.bidirectional
      ? `${edge.sourceDisplay} ↔ ${edge.targetDisplay}`
      : `${edge.sourceDisplay} → ${edge.targetDisplay}`;

    try {
      await monitoredEntitiesClient.pushCustomDevice({
        body: {
          customDeviceId: deviceId,
          displayName,
          group: 'topology-builder-bridges',
          type: 'Topology Bridge',
          // DNS names for potential Smartscape auto-discovery
          dnsNames: [
            edge.sourceDisplay.toLowerCase().replace(/[^a-z0-9.-]/g, ''),
            edge.targetDisplay.toLowerCase().replace(/[^a-z0-9.-]/g, ''),
          ].filter(Boolean),
          properties: {
            'Source Entity': edge.sourceEntityId,
            'Source Name': edge.sourceDisplay,
            'Target Entity': edge.targetEntityId,
            'Target Name': edge.targetDisplay,
            'Relationship': edge.relationType,
            'Bidirectional': String(edge.bidirectional),
            'Created By': 'Smartscape Topology Builder',
          },
        },
      });
      created.push(deviceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Push failed for ${displayName}:`, message);
      errors.push(`${displayName}: ${message}`);
    }
  }

  if (errors.length > 0 && created.length === 0) {
    return { success: false, created, errors };
  }

  return { success: true, created, errors };
}
