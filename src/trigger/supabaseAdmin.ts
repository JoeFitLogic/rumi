import { createClient } from "@supabase/supabase-js";

// The service-role Supabase client for Trigger.dev tasks.
//
// NOT src/lib/supabase/admin.ts: that is `import "server-only"`, and
// `server-only` is not a real package here (Next aliases it internally), so a
// Trigger build cannot resolve it.
//
// Derived from createClient's own signature so we don't deep-import a type out
// of @supabase/realtime-js (a transitive dep that supabase-js does not re-export).
type RealtimeTransport = NonNullable<
  NonNullable<Parameters<typeof createClient>[2]>["realtime"]
>["transport"];

/**
 * A WebSocket constructor that is never actually constructed.
 *
 * supabase-js builds a RealtimeClient eagerly inside createClient, and that
 * constructor resolves a transport up front (RealtimeClient._initializeOptions):
 *
 *   result.transport = options?.transport ?? WebSocketFactory.getWebSocketConstructor()
 *
 * On a runtime with no global WebSocket, getWebSocketConstructor() throws
 * "Node.js detected but native WebSocket not found" — at CLIENT CONSTRUCTION,
 * before a single query runs. That is what broke generate-strategy in
 * production. trigger.config.ts also moved to node-22, which HAS a global
 * WebSocket, so either fix alone is enough; this is the one that keeps holding
 * if the runtime changes again.
 *
 * Supplying `transport` short-circuits the `??`, so the factory is never
 * consulted and nothing probes the runtime for a WebSocket. Tasks only read and
 * write rows over HTTP and never open a channel, so this is never instantiated —
 * it throws loudly if that ever stops being true.
 */
const NO_REALTIME = class {
  constructor() {
    throw new Error(
      "Trigger tasks do not use Supabase realtime — no WebSocket transport is configured."
    );
  }
} as unknown as RealtimeTransport;

export function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: NO_REALTIME },
    }
  );
}
