/**
 * lib/sse-stream.ts — Lightweight SSE stream utility.
 *
 * Re-exports the full-featured createSSEStream from sse-stream-factory.ts
 * with a simplified API surface for the common case.
 *
 * Solves the "Controller is already closed" race condition by guarding
 * all enqueue/close calls behind a `closed` flag.
 *
 * @example
 * ```ts
 * import { createSSEStream, SSE_HEADERS } from '@/lib/sse-stream';
 *
 * const { stream, send, close } = createSSEStream();
 * send('progress', { phase: 'classifier', status: 'running' });
 * close(); // safe
 * close(); // no-op
 * return new Response(stream, { headers: SSE_HEADERS });
 * ```
 */

export {
  createSSEStream,
  SSE_HEADERS,
  SSE_HEADERS_NO_BUFFER,
  type SSEStreamHandle,
  type CreateSSEStreamOptions,
} from "./sse-stream-factory";
