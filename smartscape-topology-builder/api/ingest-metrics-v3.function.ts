import { metricsClient, accessTokensApiTokensClient } from '@dynatrace-sdk/client-classic-environment-v2';
import { getEnvironmentUrl } from '@dynatrace-sdk/app-environment';
import { stateClient } from '@dynatrace-sdk/client-state';

interface IngestPayload {
  metricLines: string[];
}

interface IngestResult {
  success: boolean;
  count: number;
  linesOk?: number;
  linesInvalid?: number;
  method?: string;
  error?: string;
  detail?: string;
}

const TOKEN_STATE_KEY = 'topology-builder-metrics-token';
const TOKEN_NAME = 'topology-builder-metrics-ingest';

/**
 * Retrieve a cached API token from App State, or create a new one with metrics.ingest scope.
 * The token is cached so we don't create a new one on every call.
 */
async function getOrCreateMetricsToken(): Promise<string> {
  // Try to read cached token from App State
  try {
    const cached = await stateClient.getAppState({ key: TOKEN_STATE_KEY });
    if (cached?.value) {
      const parsed = JSON.parse(cached.value);
      if (parsed.token) return parsed.token;
    }
  } catch {
    // No cached token — create one
  }

  // Create a new API token with metrics.ingest scope
  const result = await accessTokensApiTokensClient.createApiToken({
    body: {
      name: TOKEN_NAME,
      scopes: ['metrics.ingest'],
    },
  });

  const token = result.token;
  if (!token) {
    throw new Error('API token created but no token value returned');
  }

  // Cache the token in App State for reuse
  try {
    await stateClient.setAppState({
      key: TOKEN_STATE_KEY,
      body: { value: JSON.stringify({ token, createdAt: new Date().toISOString() }) },
    });
  } catch {
    // Non-fatal: token works but won't be cached
  }

  return token;
}

/**
 * Derive the live.dynatrace.com metric ingest URL from the environment.
 * environmentUrl is like "https://abc12345.apps.dynatrace.com/"
 * We need "https://abc12345.live.dynatrace.com/api/v2/metrics/ingest"
 */
function getMetricIngestUrl(): string {
  const envUrl = getEnvironmentUrl();
  // Extract the environment ID (e.g., "abc12345" from "https://abc12345.apps.dynatrace.com/")
  const match = envUrl.match(/https?:\/\/([^.]+)\.(?:apps\.)?dynatrace\.com/);
  if (!match) {
    throw new Error(`Cannot derive metric ingest URL from environment: ${envUrl}`);
  }
  const envId = match[1];
  return `https://${envId}.live.dynatrace.com/api/v2/metrics/ingest`;
}

export default async function (payload: IngestPayload): Promise<IngestResult> {
  const { metricLines } = payload ?? {};

  if (!metricLines || !Array.isArray(metricLines) || metricLines.length === 0) {
    return { success: false, count: 0, error: 'No metric data provided' };
  }

  const body = metricLines.join('\n');
  const errors: string[] = [];

  // ── Method 1: SDK metricsClient.ingest() (uses app OAuth scopes automatically) ──
  try {
    const sdkResult = await metricsClient.ingest({ body });
    const linesOk = sdkResult.linesOk ?? 0;
    const linesInvalid = sdkResult.linesInvalid ?? 0;
    return {
      success: true,
      count: metricLines.length,
      linesOk,
      linesInvalid,
      method: 'sdk-oauth',
      detail: JSON.stringify(sdkResult),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`SDK ingest: ${msg}`);
    console.log(`SDK metricsClient.ingest() failed: ${msg}, trying API token...`);
  }

  // ── Method 2: Auto-provisioned API token via internal gateway ──
  let token: string | null = null;
  try {
    token = await getOrCreateMetricsToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`Token creation: ${msg}`);
    console.log(`Token creation failed: ${msg}`);
  }

  if (token) {
    // Try internal platform gateway
    try {
      const internalResp = await fetch('/platform/classic/environment-api/v2/metrics/ingest', {
        method: 'POST',
        headers: {
          'Authorization': `Api-Token ${token}`,
          'Content-Type': 'text/plain',
        },
        body,
      });

      if (internalResp.ok || internalResp.status === 202) {
        const respBody = await internalResp.text();
        let linesOk = 0;
        let linesInvalid = 0;
        try {
          const parsed = JSON.parse(respBody);
          linesOk = parsed?.linesOk ?? 0;
          linesInvalid = parsed?.linesInvalid ?? 0;
        } catch { /* non-JSON response */ }
        return { success: true, count: metricLines.length, linesOk, linesInvalid, method: 'internal-api-token', detail: respBody };
      }

      const internalErr = await internalResp.text();
      errors.push(`Internal gateway (${internalResp.status}): ${internalErr}`);
      console.log(`Internal ingest failed (${internalResp.status}): ${internalErr}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`Internal gateway error: ${msg}`);
      console.log(`Internal ingest error: ${msg}`);
    }

    // Fall back to external live.dynatrace.com
    try {
      const externalUrl = getMetricIngestUrl();
      const externalResp = await fetch(externalUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Api-Token ${token}`,
          'Content-Type': 'text/plain',
        },
        body,
      });

      if (externalResp.ok || externalResp.status === 202) {
        const respBody = await externalResp.text();
        let linesOk = 0;
        let linesInvalid = 0;
        try {
          const parsed = JSON.parse(respBody);
          linesOk = parsed?.linesOk ?? 0;
          linesInvalid = parsed?.linesInvalid ?? 0;
        } catch { /* non-JSON response */ }
        return { success: true, count: metricLines.length, linesOk, linesInvalid, method: 'external-api-token', detail: respBody };
      }

      const externalErr = await externalResp.text();
      errors.push(`External (${externalResp.status}): ${externalErr}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`External error: ${msg}`);
    }
  }

  return { success: false, count: 0, error: `All ingest methods failed:\n${errors.join('\n')}` };
}
