import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionClientAccount } from "@/lib/provision";
import { mapIntakePayload } from "@/lib/onboarding";
import type { GenerateStrategyPayload } from "@/trigger/generate-strategy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_WINDOW_DAYS = 3;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pull the contact email out of a GHL payload — try common keys, else scan
// values for the first email-shaped string.
function extractEmail(payload: Record<string, unknown>): string | null {
  for (const key of Object.keys(payload)) {
    if (/e-?mail/i.test(key)) {
      const v = String(payload[key] ?? "").trim();
      if (EMAIL_RE.test(v)) return v.toLowerCase();
    }
  }
  for (const v of Object.values(payload)) {
    const s = String(v ?? "").trim();
    if (EMAIL_RE.test(s)) return s.toLowerCase();
  }
  return null;
}

// Build a display name from first/last/full-name style fields.
function extractName(payload: Record<string, unknown>): string {
  const get = (re: RegExp) => {
    for (const key of Object.keys(payload)) {
      if (re.test(key)) {
        const v = String(payload[key] ?? "").trim();
        if (v) return v;
      }
    }
    return "";
  };
  const full = get(/^full[\s_-]?name$/i) || get(/^name$/i);
  if (full) return full;
  const first = get(/first[\s_-]?name/i);
  const last = get(/last[\s_-]?name/i);
  return [first, last].filter(Boolean).join(" ").trim();
}

export async function POST(request: Request) {
  // ── auth: INTAKE_SECRET via header (preferred) or ?secret= query ──────
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-intake-secret") ?? url.searchParams.get("secret");
  if (!process.env.INTAKE_SECRET || provided !== process.env.INTAKE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = extractEmail(payload);
  if (!email) {
    return NextResponse.json(
      { error: "No email found in payload" },
      { status: 400 }
    );
  }
  const name = extractName(payload);
  const firstName = name.split(" ")[0] || null;

  try {
    // 1. get-or-create the client account + send the set-password invite.
    const { userId } = await provisionClientAccount({
      email,
      name,
      sendInvite: true,
    });

    const admin = createAdminClient();

    // 2. Idempotency: if a strategy is already pending/generating for this
    //    user, do not double-fire (Cleo's double-generation bug).
    const { data: inflight } = await admin
      .from("strategies")
      .select("id, status")
      .eq("user_id", userId)
      .in("status", ["pending", "generating"])
      .limit(1)
      .maybeSingle();
    if (inflight) {
      return NextResponse.json(
        { ok: true, deduped: true, strategyId: inflight.id, userId },
        { status: 200 }
      );
    }

    // 3. Insert the onboarding responses (status 'submitted').
    const mapped = mapIntakePayload(payload);
    const { data: onboarding, error: onbErr } = await admin
      .from("onboarding_responses")
      .insert({ user_id: userId, status: "submitted", ...mapped })
      .select("id")
      .single();
    if (onbErr || !onboarding) {
      throw new Error(`onboarding insert failed: ${onbErr?.message}`);
    }

    // 4. Create the strategy row: pending, review deadline = now + 3 days.
    const reviewDeadline = new Date(
      Date.now() + REVIEW_WINDOW_DAYS * 86_400_000
    ).toISOString();
    const { data: strategy, error: stratErr } = await admin
      .from("strategies")
      .insert({
        user_id: userId,
        onboarding_id: onboarding.id,
        client_name: firstName,
        status: "pending",
        review_deadline: reviewDeadline,
      })
      .select("id")
      .single();
    if (stratErr || !strategy) {
      throw new Error(`strategy insert failed: ${stratErr?.message}`);
    }

    // 5. Fire the generation task (enqueues fast) and respond 200.
    const taskPayload: GenerateStrategyPayload = {
      strategyId: strategy.id,
      userId,
      onboardingId: onboarding.id,
    };
    await tasks.trigger("generate-strategy", taskPayload);

    return NextResponse.json(
      { ok: true, strategyId: strategy.id, userId },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
