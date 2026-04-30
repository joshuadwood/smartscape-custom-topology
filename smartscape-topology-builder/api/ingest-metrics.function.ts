import { metricsClient } from '@dynatrace-sdk/client-classic-environment-v2';

interface IngestPayload {
  metricLines: string[];
}

export default async function (payload: IngestPayload): Promise<{ success: boolean; count: number; error?: string }> {
  const { metricLines } = payload ?? {};

  if (!metricLines || !Array.isArray(metricLines) || metricLines.length === 0) {
    return { success: false, count: 0, error: 'No metric lines provided' };
  }

  const body = metricLines.join('\n');
  try {
    await metricsClient.ingest({ body });
    return { success: true, count: metricLines.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Metric ingest failed in app function:', message);
    return { success: false, count: 0, error: message };
  }
}
