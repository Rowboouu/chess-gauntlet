/**
 * Server-side helper to push a fast-path state update over Supabase Realtime
 * **Broadcast** (not postgres_changes).
 *
 * Why: postgres_changes goes through WAL → Realtime decoder → broadcast, which
 * typically lands at the opponent in ~150 ms. The Realtime Broadcast REST
 * endpoint sends straight to channel subscribers in ~30-50 ms. We use this in
 * parallel with the DB write so the opponent sees the move ~100 ms sooner —
 * the DB write still runs for persistence (and the postgres_changes echo
 * follows shortly after as a confirmation).
 *
 * Channel name matches the client's subscribe: `mp:${gameId}`. Game IDs are
 * UUIDs (unguessable) so we accept that broadcast skips RLS — same threat
 * model as the share-link invite flow.
 */
import "server-only";

export async function broadcastMpState(
  gameId: string,
  state: object,
): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !anon || !srk) return;

  try {
    await fetch(`${baseUrl}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${srk}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `mp:${gameId}`,
            event: "state",
            payload: state,
            private: false,
          },
        ],
      }),
      // Don't block forever if Realtime is sluggish; postgres_changes is the
      // safety net.
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Fire-and-forget; if the broadcast fails, the eventual postgres_changes
    // echo (and the 3 s polling fallback) still deliver the update.
  }
}
