import { NextResponse } from "next/server";
import { mapIntakePayload } from "@/lib/onboarding";
import { submitOnboarding } from "@/lib/submitOnboarding";

// LEGACY GHL intake webhook. Kept working as the fallback while the native
// /onboarding form takes over. The pipeline itself now lives in
// src/lib/submitOnboarding.ts and is shared with the form, so the two cannot
// drift; this route is only the GHL-shaped envelope around it (secret auth,
// loose payload key matching, the JSON response GHL expects).
//
// mapIntakePayload still resolves every label this form has ever sent — the
// Resonance rewording moved those labels into `aliases` rather than replacing
// them. See src/lib/onboarding.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  try {
    const result = await submitOnboarding({
      email,
      name: extractName(payload),
      responses: mapIntakePayload(payload),
      source: "ghl",
    });

    // Response shape unchanged from before the extraction — `deduped` is only
    // present when it is true, as GHL's logs have always shown it.
    return NextResponse.json(
      result.deduped
        ? {
            ok: true,
            deduped: true,
            strategyId: result.strategyId,
            userId: result.userId,
          }
        : { ok: true, strategyId: result.strategyId, userId: result.userId },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
