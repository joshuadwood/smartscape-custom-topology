import { eventsClient } from '@dynatrace-sdk/client-classic-environment-v2';

interface IngestPayload {
  metricLines: string[];
}

/**
 * Parse a metric-line-format string into an event title + properties.
 * Format: metric.key,dim1="val1",dim2="val2" gauge,1
 */
function parseMetricLine(line: string): { title: string; properties: Record<string, string> } {
  // Split off the value part (after the last space before gauge/count)
  const spaceIdx = line.indexOf(' ');
  const keyDims = spaceIdx > 0 ? line.substring(0, spaceIdx) : line;

  // Split metric key from dimensions at the first comma
  const commaIdx = keyDims.indexOf(',');
  const title = commaIdx > 0 ? keyDims.substring(0, commaIdx) : keyDims;
  const dimStr = commaIdx > 0 ? keyDims.substring(commaIdx + 1) : '';

  // Parse dimensions: key="value" pairs separated by commas
  const properties: Record<string, string> = {};
  if (dimStr) {
    const dimRegex = /([^,=]+)="([^"]*)"/g;
    let match;
    while ((match = dimRegex.exec(dimStr)) !== null) {
      properties[match[1]] = match[2];
    }
  }

  return { title, properties };
}

export default async function (payload: IngestPayload): Promise<{ success: boolean; count: number; error?: string }> {
  const { metricLines } = payload ?? {};

  if (!metricLines || !Array.isArray(metricLines) || metricLines.length === 0) {
    return { success: false, count: 0, error: 'No event data provided' };
  }

  const errors: string[] = [];
  let ingested = 0;

  for (const line of metricLines) {
    const { title, properties } = parseMetricLine(line);
    try {
      await eventsClient.createEvent({
        body: {
          eventType: 'CUSTOM_INFO',
          title,
          properties,
        },
      });
      ingested++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Event ingest failed for "${title}":`, message);
      errors.push(`${title}: ${message}`);
    }
  }

  if (errors.length > 0 && ingested === 0) {
    return { success: false, count: 0, error: errors.join('\n') };
  }

  if (errors.length > 0) {
    return { success: true, count: ingested, error: `Partial: ${errors.length} failed:\n${errors.join('\n')}` };
  }

  return { success: true, count: ingested };
}
