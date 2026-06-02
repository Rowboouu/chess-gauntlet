/**
 * Server-side rate limiting via the Postgres `check_rate_limit` RPC.
 *
 * One DB round-trip (~5-15ms on sin1→sin1) per call. Acceptable for
 * non-hot-path write endpoints. Deliberately NOT applied to /api/mp-move,
 * where chess turn validation already constrains abuse and the latency
 * matters for clock fairness.
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RateLimitOptions {
  /** Identifier for the bucket — e.g. "mp_create", "mp_resign". */
  bucket: string;
  /** Maximum number of requests allowed inside the window. */
  limit: number;
  /** Window length in milliseconds (e.g. 60_000 for one minute). */
  windowMs: number;
}

/**
 * Returns null if the request may proceed, or a 429 NextResponse if the
 * caller has exceeded the bucket's limit.
 *
 * Pass the admin (service-role) Supabase client — the RPC is locked to
 * service_role to keep the rate-limit table off the public API surface.
 */
export async function enforceRateLimit(
  admin: SupabaseClient,
  userId: string,
  opts: RateLimitOptions,
): Promise<NextResponse | null> {
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_user_id: userId,
    p_bucket: opts.bucket,
    p_limit: opts.limit,
    p_window_ms: opts.windowMs,
  });
  // Fail open on RPC errors — we'd rather serve a legitimate request than
  // drop a game move because rate-limiting itself broke.
  if (error) return null;
  if (data === true) return null;
  return NextResponse.json(
    { error: "Too many requests — slow down a little." },
    { status: 429 },
  );
}
