import { metricsClient } from '@dynatrace-sdk/client-classic-environment-v2';
import { businessEventsClient } from '@dynatrace-sdk/client-classic-environment-v2';

interface IngestPayload {
  metricLines: string[];
}

interface IngestResult {
  success: boolean;
  count: number;
  method?: string;
  error?: string;
  details?: string;
}

/**
 * Try multiple ingest methods in order:
 * 1. SDK metricsClient.ingest() (uses storage:metrics:write OAuth scope)
 * 2. OTLP JSON to /api/v2/otlp/v1/metrics (platform proxy, may use different scope)
 * 3. MINT line protocol to /platform/classic/environment-api/v2/metrics/ingest
 * 4. Business events ingest (uses storage:bizevents:write scope)
 * 5. Probe additional OTLP paths
 */
export default async function (payload: IngestPayload): Promise<IngestResult> {
  const { metricLines } = payload ?? {};

  if (!metricLines || !Array.isArray(metricLines) || metricLines.length === 0) {
    return { success: false, count: 0, error: 'No metric lines provided' };
  }

  const errors: string[] = [];

  // Method 1: SDK metricsClient.ingest()
  try {
    const body = metricLines.join('\n');
    await metricsClient.ingest({ body });
    return { success: true, count: metricLines.length, method: 'sdk-ingest' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`SDK ingest: ${msg}`);
    console.log('[1] SDK ingest failed:', msg);
  }

  // Method 2: OTLP JSON via platform proxy /api/v2/ path (different from classic env API)
  try {
    const otlpBody = buildOtlpPayload(metricLines);
    const r = await fetch('/api/v2/otlp/v1/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(otlpBody),
    });
    if (r.ok || r.status === 200 || r.status === 202) {
      return { success: true, count: metricLines.length, method: 'otlp-api-v2' };
    }
    const text = await r.text();
    errors.push(`OTLP /api/v2 (${r.status}): ${text}`);
    console.log('[2] OTLP /api/v2 failed:', r.status, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`OTLP /api/v2: ${msg}`);
  }

  // Method 3: MINT via classic environment API proxy
  try {
    const body = metricLines.join('\n');
    const r = await fetch('/platform/classic/environment-api/v2/metrics/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body,
    });
    if (r.ok || r.status === 200 || r.status === 202) {
      return { success: true, count: metricLines.length, method: 'mint-classic' };
    }
    const text = await r.text();
    errors.push(`MINT classic (${r.status}): ${text}`);
    console.log('[3] MINT classic failed:', r.status, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`MINT classic: ${msg}`);
  }

  // Method 4: Business events ingest (different scope: storage:bizevents:write)
  try {
    const bizEvents = metricLines.map((line) => {
      const parsed = parseMintLine(line);
      return {
        type: 'topology-metric-proxy',
        source: 'smartscape-topology-builder',
        data: {
          'metric.key': parsed.metricKey,
          ...parsed.dimensions,
          value: parsed.value,
        },
      };
    });
    // Ingest as CloudEvent batch
    const r = await fetch('/platform/classic/environment-api/v2/bizevents/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/cloudevent-batch+json' },
      body: JSON.stringify(bizEvents.map((evt) => ({
        specversion: '1.0',
        id: `topo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source: evt.source,
        type: evt.type,
        data: evt.data,
      }))),
    });
    if (r.ok || r.status === 200 || r.status === 202) {
      return { success: true, count: metricLines.length, method: 'bizevents' };
    }
    const text = await r.text();
    errors.push(`BizEvents (${r.status}): ${text}`);
    console.log('[4] BizEvents failed:', r.status, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`BizEvents: ${msg}`);
  }

  // Method 5: OTLP JSON via platform ingest path
  try {
    const otlpBody = buildOtlpPayload(metricLines);
    const r = await fetch('/platform/ingest/v1/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(otlpBody),
    });
    if (r.ok || r.status === 200 || r.status === 202) {
      return { success: true, count: metricLines.length, method: 'otlp-platform-ingest' };
    }
    const text = await r.text();
    errors.push(`OTLP /platform/ingest (${r.status}): ${text}`);
    console.log('[5] OTLP /platform/ingest failed:', r.status, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`OTLP /platform/ingest: ${msg}`);
  }

  // Method 6: MINT via /api/v2/ path (platform proxy)
  try {
    const body = metricLines.join('\n');
    const r = await fetch('/api/v2/metrics/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body,
    });
    if (r.ok || r.status === 200 || r.status === 202) {
      return { success: true, count: metricLines.length, method: 'mint-api-v2' };
    }
    const text = await r.text();
    errors.push(`MINT /api/v2 (${r.status}): ${text}`);
    console.log('[6] MINT /api/v2 failed:', r.status, text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`MINT /api/v2: ${msg}`);
  }

  return {
    success: false,
    count: 0,
    error: 'All ingest methods failed',
    details: errors.join('\n---\n'),
  };
}

function parseMintLine(line: string): { metricKey: string; dimensions: Record<string, string>; value: number } {
  const spaceIdx = line.lastIndexOf(' ');
  const keyDims = line.substring(0, spaceIdx);
  const typeValue = line.substring(spaceIdx + 1);
  const value = parseFloat(typeValue.split(',')[1] || '1');
  const commaIdx = keyDims.indexOf(',');
  const metricKey = commaIdx > 0 ? keyDims.substring(0, commaIdx) : keyDims;
  const dimsStr = commaIdx > 0 ? keyDims.substring(commaIdx + 1) : '';
  const dimensions: Record<string, string> = {};
  if (dimsStr) {
    const dimRegex = /([^,=]+)="([^"]*)"/g;
    let match;
    while ((match = dimRegex.exec(dimsStr)) !== null) {
      dimensions[match[1]] = match[2];
    }
  }
  return { metricKey, dimensions, value };
}

/**
 * Parse MINT line protocol into OTLP ExportMetricsServiceRequest JSON.
 * Format: metricKey,dim1="val1",dim2="val2" gauge,value
 */
function buildOtlpPayload(metricLines: string[]): object {
  const nowNano = String(Date.now() * 1000000);
  const metrics = metricLines.map((line) => {
    // Parse: key,dims type,value
    const spaceIdx = line.lastIndexOf(' ');
    const keyDims = line.substring(0, spaceIdx);
    const typeValue = line.substring(spaceIdx + 1);
    const value = parseFloat(typeValue.split(',')[1] || '1');

    const commaIdx = keyDims.indexOf(',');
    const metricName = commaIdx > 0 ? keyDims.substring(0, commaIdx) : keyDims;
    const dimsStr = commaIdx > 0 ? keyDims.substring(commaIdx + 1) : '';

    const attributes: Array<{ key: string; value: { stringValue: string } }> = [];
    if (dimsStr) {
      // Parse key="value" pairs
      const dimRegex = /([^,=]+)="([^"]*)"/g;
      let match;
      while ((match = dimRegex.exec(dimsStr)) !== null) {
        attributes.push({
          key: match[1],
          value: { stringValue: match[2] },
        });
      }
    }

    return {
      name: metricName,
      gauge: {
        dataPoints: [{
          asDouble: value,
          timeUnixNano: nowNano,
          attributes,
        }],
      },
    };
  });

  return {
    resourceMetrics: [{
      resource: { attributes: [] },
      scopeMetrics: [{
        scope: { name: 'topology-builder' },
        metrics,
      }],
    }],
  };
}
