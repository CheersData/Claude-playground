/**
 * SSE Stream Factory — safe ReadableStream wrapper for Server-Sent Events.
 *
 * Solves the "Controller is already closed" race condition that crashes Next.js
 * when async callbacks (keepalive timers, child process events, abort signals)
 * try to write to the stream after the client disconnects.
 *
 * Usage:
 *   const { stream, send, close, onCleanup } = createSSEStream(request);
 *   onCleanup(() => clearInterval(myTimer));
 *   send("progress", { phase: "running" });
 *   close();
 *   return new Response(stream, { headers: SSE_HEADERS });
 */

/** Standard SSE response headers. */
export const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

/** Extended SSE headers with proxy buffering disabled (for nginx/reverse proxies). */
export const SSE_HEADERS_NO_BUFFER: HeadersInit = {
  ...SSE_HEADERS,
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

export interface SSEStreamHandle {
  /** The ReadableStream to pass to `new Response(stream, ...)`. */
  stream: ReadableStream<Uint8Array>;

  /**
   * Send an SSE event. No-op if the stream is already closed.
   * Format: `event: <name>\ndata: <json>\n\n`
   */
  send: (event: string, data: unknown) => void;

  /**
   * Send a data-only SSE message (no event name). No-op if closed.
   * Format: `data: <json>\n\n`
   * Useful for endpoints that use the default SSE message type.
   */
  sendData: (data: unknown) => void;

  /**
   * Send an SSE comment (keepalive/heartbeat). No-op if closed.
   * Format: `: <comment>\n\n`
   */
  sendComment: (comment: string) => void;

  /**
   * Close the stream idempotently. Safe to call multiple times.
   * Runs all registered cleanup functions before closing.
   */
  close: () => void;

  /**
   * Register a cleanup function that runs when the stream closes
   * (either by explicit close() or by client disconnect via abort signal).
   * Use this for clearInterval, child.kill, unsubscribe, etc.
   */
  onCleanup: (fn: () => void) => void;

  /** Whether the stream has been closed. */
  readonly closed: boolean;
}

export interface CreateSSEStreamOptions {
  /**
   * If provided, the stream will listen for the abort signal and
   * auto-close + cleanup when the client disconnects.
   * Pass `request.signal` from the Next.js route handler.
   */
  request?: Request;

  /**
   * Use extended headers with X-Accel-Buffering: no.
   * Default: false
   */
  noBuffer?: boolean;
}

/**
 * Create a safe SSE stream with built-in guards against the
 * "Controller is already closed" race condition.
 *
 * The returned handle provides:
 * - `send()` / `sendComment()` — guarded writes (no-op after close)
 * - `close()` — idempotent close with cleanup
 * - `onCleanup()` — register teardown callbacks
 * - `stream` — the ReadableStream for the Response
 *
 * @example
 * ```ts
 * export async function GET(req: Request) {
 *   const { stream, send, close, onCleanup } = createSSEStream({ request: req });
 *
 *   const timer = setInterval(() => send("ping", { ts: Date.now() }), 15000);
 *   onCleanup(() => clearInterval(timer));
 *
 *   // ... do async work, call send() from callbacks ...
 *
 *   close(); // when done
 *   return new Response(stream, { headers: SSE_HEADERS });
 * }
 * ```
 */
export function createSSEStream(
  options: CreateSSEStreamOptions = {}
): SSEStreamHandle {
  const encoder = new TextEncoder();
  const cleanupFns: Array<() => void> = [];
  let streamClosed = false;
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const runCleanup = () => {
    for (const fn of cleanupFns) {
      try {
        fn();
      } catch {
        // Cleanup functions must not throw
      }
    }
    // Clear the array to prevent double-execution
    cleanupFns.length = 0;
  };

  const close = () => {
    if (streamClosed) return;
    streamClosed = true;
    runCleanup();
    if (controller) {
      try {
        controller.close();
      } catch {
        // Controller may already be closed by the runtime
      }
    }
  };

  const send = (event: string, data: unknown) => {
    if (streamClosed || !controller) return;
    try {
      controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
      );
    } catch {
      // Controller closed between our check and the enqueue — close gracefully
      close();
    }
  };

  const sendData = (data: unknown): void => {
    if (streamClosed || !controller) return;
    try {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
      );
    } catch {
      close();
    }
  };

  const sendComment = (comment: string) => {
    if (streamClosed || !controller) return;
    try {
      controller.enqueue(encoder.encode(`: ${comment}\n\n`));
    } catch {
      close();
    }
  };

  const onCleanup = (fn: () => void) => {
    if (streamClosed) {
      // Already closed — run immediately
      try {
        fn();
      } catch {
        // ignore
      }
      return;
    }
    cleanupFns.push(fn);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl;
    },
    cancel() {
      // Called by the runtime when the client disconnects
      close();
    },
  });

  // Listen for client disconnect via abort signal
  if (options.request?.signal) {
    const signal = options.request.signal;
    if (signal.aborted) {
      // Already aborted before we started
      close();
    } else {
      const onAbort = () => close();
      signal.addEventListener("abort", onAbort, { once: true });
      // Clean up the listener if we close normally
      onCleanup(() => signal.removeEventListener("abort", onAbort));
    }
  }

  return {
    stream,
    send,
    sendData,
    sendComment,
    close,
    onCleanup,
    get closed() {
      return streamClosed;
    },
  };
}
