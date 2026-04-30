import { accessTokensApiTokensClient } from '@dynatrace-sdk/client-classic-environment-v2';
import { getEnvironmentUrl } from '@dynatrace-sdk/app-environment';
import { stateClient } from '@dynatrace-sdk/client-state';

interface TopologyEdge {
  sourceEntityId: string;
  sourceDisplayName: string;
  targetEntityId: string;
  targetDisplayName: string;
  relationType: string;
  bidirectional: boolean;
}

interface TraceIngestPayload {
  edges: TopologyEdge[];
}

interface TraceIngestResult {
  success: boolean;
  edgesProcessed: number;
  method?: string;
  error?: string;
  detail?: string;
}

// ─── Protobuf wire format encoder ────────────────────────────────────────────
// Minimal hand-rolled encoder for OTLP ExportTraceServiceRequest.
// Dynatrace OTLP API requires binary protobuf (JSON not supported).

function varint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return new Uint8Array(bytes);
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

/** Encode a length-delimited field (string, bytes, nested message). */
function lenField(fieldNum: number, data: Uint8Array): Uint8Array {
  return concat([varint((fieldNum << 3) | 2), varint(data.length), data]);
}

/** Encode a varint field (int32, uint32, enum, bool). */
function varintField(fieldNum: number, value: number): Uint8Array {
  return concat([varint((fieldNum << 3) | 0), varint(value)]);
}

/** Encode a fixed64 field (uint64 as two 32-bit parts, little-endian). */
function fixed64Field(fieldNum: number, hi: number, lo: number): Uint8Array {
  const tag = varint((fieldNum << 3) | 1);
  const buf = new Uint8Array(tag.length + 8);
  buf.set(tag, 0);
  const view = new DataView(buf.buffer, buf.byteOffset + tag.length, 8);
  view.setUint32(0, lo, true);  // little-endian low 32 bits
  view.setUint32(4, hi, true);  // little-endian high 32 bits
  return buf;
}

function strField(fieldNum: number, value: string): Uint8Array {
  return lenField(fieldNum, new TextEncoder().encode(value));
}

function msgField(fieldNum: number, parts: Uint8Array[]): Uint8Array {
  return lenField(fieldNum, concat(parts));
}

/** Split a nanosecond timestamp (number) into hi/lo 32-bit parts. */
function nanoSplit(nanos: number): { hi: number; lo: number } {
  // nanos can exceed 2^32, use Math for splitting
  const hi = Math.floor(nanos / 0x100000000) >>> 0;
  const lo = (nanos % 0x100000000) >>> 0;
  return { hi, lo };
}

// ─── OTLP proto message encoders ─────────────────────────────────────────────

function encodeKeyValue(key: string, strValue: string): Uint8Array {
  // KeyValue { key=1(string), value=2(AnyValue) }
  // AnyValue { string_value=1 }
  const anyValue = strField(1, strValue);
  return concat([strField(1, key), msgField(2, [anyValue])]);
}

function encodeResource(attrs: Array<[string, string]>): Uint8Array {
  // Resource { repeated KeyValue attributes = 1 }
  return concat(attrs.map(([k, v]) => msgField(1, [encodeKeyValue(k, v)])));
}

function encodeSpan(opts: {
  traceId: Uint8Array;
  spanId: Uint8Array;
  parentSpanId?: Uint8Array;
  name: string;
  kind: number;
  startNanos: number;
  endNanos: number;
  attrs: Array<[string, string]>;
  statusCode: number;
}): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(lenField(1, opts.traceId));   // trace_id = 1 (bytes)
  parts.push(lenField(2, opts.spanId));    // span_id = 2 (bytes)
  if (opts.parentSpanId) {
    parts.push(lenField(4, opts.parentSpanId)); // parent_span_id = 4
  }
  parts.push(strField(5, opts.name));      // name = 5
  parts.push(varintField(6, opts.kind));   // kind = 6 (enum)

  const start = nanoSplit(opts.startNanos);
  parts.push(fixed64Field(7, start.hi, start.lo)); // start_time_unix_nano = 7

  const end = nanoSplit(opts.endNanos);
  parts.push(fixed64Field(8, end.hi, end.lo)); // end_time_unix_nano = 8

  for (const [k, v] of opts.attrs) {
    parts.push(msgField(9, [encodeKeyValue(k, v)])); // attributes = 9 (repeated)
  }

  // status = 15: Status { code = 2 (enum) }
  parts.push(msgField(15, [varintField(2, opts.statusCode)]));

  return concat(parts);
}

function buildOtlpProtobuf(edge: TopologyEdge): Uint8Array {
  const traceId = crypto.getRandomValues(new Uint8Array(16));
  const clientSpanId = crypto.getRandomValues(new Uint8Array(8));
  const serverSpanId = crypto.getRandomValues(new Uint8Array(8));
  const nowMs = Date.now();
  const startNanos = nowMs * 1_000_000;
  const endNanos = startNanos + 1_000_000; // +1ms

  // CLIENT span — attributed to SOURCE service
  const clientSpan = encodeSpan({
    traceId, spanId: clientSpanId,
    name: `topology: ${edge.sourceDisplayName} → ${edge.targetDisplayName}`,
    kind: 3, // SPAN_KIND_CLIENT
    startNanos, endNanos,
    attrs: [
      ['topology.synthetic', 'true'],
      ['peer.service', edge.targetDisplayName],
    ],
    statusCode: 1, // STATUS_CODE_OK
  });

  const sourceResource = encodeResource([
    ['service.name', edge.sourceDisplayName],
    ['dt.entity.service', edge.sourceEntityId],
  ]);

  // ScopeSpans { scope=1, spans=2 }
  const scopeBody = concat([strField(1, 'smartscape-topology-builder'), strField(2, '1.0')]);
  const sourceScopeSpans = concat([
    msgField(1, [scopeBody]),           // scope = 1
    msgField(2, [clientSpan]),           // spans = 2
  ]);

  // ResourceSpans { resource=1, scope_spans=2 }
  const sourceRS = concat([
    msgField(1, [sourceResource]),       // resource = 1
    msgField(2, [sourceScopeSpans]),     // scope_spans = 2
  ]);

  // SERVER span — attributed to TARGET service
  const serverSpan = encodeSpan({
    traceId, spanId: serverSpanId,
    parentSpanId: clientSpanId,
    name: `topology: ${edge.sourceDisplayName} → ${edge.targetDisplayName}`,
    kind: 2, // SPAN_KIND_SERVER
    startNanos, endNanos,
    attrs: [
      ['topology.synthetic', 'true'],
    ],
    statusCode: 1,
  });

  const targetResource = encodeResource([
    ['service.name', edge.targetDisplayName],
    ['dt.entity.service', edge.targetEntityId],
  ]);

  const targetScopeSpans = concat([
    msgField(1, [scopeBody]),
    msgField(2, [serverSpan]),
  ]);

  const targetRS = concat([
    msgField(1, [targetResource]),
    msgField(2, [targetScopeSpans]),
  ]);

  // ExportTraceServiceRequest { repeated ResourceSpans resource_spans = 1 }
  return concat([
    msgField(1, [sourceRS]),
    msgField(1, [targetRS]),
  ]);
}

// ─── API token management ────────────────────────────────────────────────────

const TRACE_TOKEN_KEY = 'topology-builder-trace-token';
const TRACE_TOKEN_NAME = 'topology-builder-trace-ingest';

async function getOrCreateTraceToken(): Promise<string> {
  try {
    const cached = await stateClient.getAppState({ key: TRACE_TOKEN_KEY });
    if (cached?.value) {
      const parsed = JSON.parse(cached.value);
      if (parsed.token) return parsed.token;
    }
  } catch { /* no cached token */ }

  const result = await accessTokensApiTokensClient.createApiToken({
    body: {
      name: TRACE_TOKEN_NAME,
      scopes: ['openTelemetryTrace.ingest'],
    },
  });

  const token = result.token;
  if (!token) throw new Error('Token created but no value returned');

  try {
    await stateClient.setAppState({
      key: TRACE_TOKEN_KEY,
      body: { value: JSON.stringify({ token, createdAt: new Date().toISOString() }) },
    });
  } catch { /* non-fatal */ }

  return token;
}

function getTraceIngestUrl(): string {
  const envUrl = getEnvironmentUrl();
  const match = envUrl.match(/https?:\/\/([^.]+)\.(?:apps\.)?dynatrace\.com/);
  if (!match) throw new Error(`Cannot derive ingest URL from: ${envUrl}`);
  return `https://${match[1]}.live.dynatrace.com/api/v2/otlp/v1/traces`;
}

// ─── Main function ───────────────────────────────────────────────────────────

export default async function (payload: TraceIngestPayload): Promise<TraceIngestResult> {
  const { edges } = payload ?? {};

  if (!edges || !Array.isArray(edges) || edges.length === 0) {
    return { success: false, edgesProcessed: 0, error: 'No edges provided' };
  }

  // Get API token for trace ingest
  let token: string;
  try {
    token = await getOrCreateTraceToken();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, edgesProcessed: 0, error: `Token: ${msg}` };
  }

  const url = getTraceIngestUrl();
  const errors: string[] = [];
  let processed = 0;

  for (const edge of edges) {
    const protobuf = buildOtlpProtobuf(edge);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-protobuf',
          'Authorization': `Api-Token ${token}`,
        },
        body: protobuf,
      });

      if (resp.ok || resp.status === 202) {
        processed++;
        console.log(`Trace OK for ${edge.sourceDisplayName} → ${edge.targetDisplayName}: ${resp.status}`);
      } else {
        const body = await resp.text();
        errors.push(`${edge.sourceDisplayName}→${edge.targetDisplayName}: ${resp.status} ${body}`);
        console.log(`Trace failed: ${resp.status} ${body}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${edge.sourceDisplayName}→${edge.targetDisplayName}: ${msg}`);
    }

    // Reverse direction if bidirectional
    if (edge.bidirectional) {
      const reverse: TopologyEdge = {
        ...edge,
        sourceEntityId: edge.targetEntityId,
        sourceDisplayName: edge.targetDisplayName,
        targetEntityId: edge.sourceEntityId,
        targetDisplayName: edge.sourceDisplayName,
      };
      const reverseProto = buildOtlpProtobuf(reverse);

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-protobuf',
            'Authorization': `Api-Token ${token}`,
          },
          body: reverseProto,
        });

        if (resp.ok || resp.status === 202) {
          processed++;
          console.log(`Reverse trace OK: ${edge.targetDisplayName} → ${edge.sourceDisplayName}: ${resp.status}`);
        } else {
          const body = await resp.text();
          errors.push(`${edge.targetDisplayName}→${edge.sourceDisplayName} (rev): ${resp.status} ${body}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${edge.targetDisplayName}→${edge.sourceDisplayName} (rev): ${msg}`);
      }
    }
  }

  if (processed === 0) {
    return {
      success: false, edgesProcessed: 0, method: 'otlp-protobuf-external',
      error: 'All trace ingestions failed', detail: errors.join('; '),
    };
  }

  return {
    success: true, edgesProcessed: processed, method: 'otlp-protobuf-external',
    detail: errors.length > 0 ? `${processed} OK, ${errors.length} failed: ${errors.join('; ')}` : undefined,
  };
}
