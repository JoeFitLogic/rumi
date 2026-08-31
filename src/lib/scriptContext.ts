import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { ONBOARDING_FIELDS, GROUP_ORDER } from "@/lib/onboarding";

// The client-context blocks the Script Studio generators write from.
//
// This lives outside script-studio/actions.ts because that file is "use server":
// every export there has to be a server action, so a shared helper cannot be
// imported out of it. Interview mode needs the same context the form flow uses,
// so the builder moved here verbatim rather than being duplicated.

type Db = ReturnType<typeof createAdminClient>;

async function latestOnboarding(
  db: Db,
  clientId: string
): Promise<Record<string, unknown> | null> {
  const { data } = await db
    .from("onboarding_responses")
    .select("*")
    .eq("user_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Record<string, unknown>) ?? null;
}

function answered(responses: Record<string, unknown>, columns?: Set<string>) {
  return ONBOARDING_FIELDS.filter((f) => (columns ? columns.has(f.column) : true)).filter((f) => {
    const v = responses[f.column];
    return v !== null && v !== undefined && String(v).trim().length > 0;
  });
}

/**
 * The FULL client context: every answered onboarding field, grouped, plus the
 * voice sample. Used by the form flow's hook and script passes so both are
 * written off the exact same data.
 */
export async function buildClientContext(db: Db, clientId: string): Promise<string> {
  const responses = await latestOnboarding(db, clientId);
  if (!responses) return "No onboarding answers on file for this client yet.";

  const parts: string[] = [
    "Here is everything we know about this client. Write the script in THEIR voice, from these answers up.",
    "",
  ];

  for (const group of GROUP_ORDER) {
    const fields = answered(responses).filter((f) => f.group === group);
    if (fields.length === 0) continue;
    parts.push(`## ${group}`);
    for (const f of fields) {
      parts.push(`${f.label}:`);
      parts.push(String(responses[f.column]).trim());
      parts.push("");
    }
  }

  const voice = responses.voice_transcript;
  if (typeof voice === "string" && voice.trim().length > 0) {
    parts.push("## VOICE SAMPLE (match this exact speaking voice, rhythm and word choice)");
    parts.push(voice.trim());
    parts.push("");
  }

  return parts.join("\n").trim();
}

// Interview mode re-sends its context on EVERY turn, and a 20-turn interview
// would carry the full onboarding dump 20 times. These are the answers that
// actually shape how Rumi talks and how the script sounds, plus the parts of the
// client's world a good interviewer needs to ask a sharp second question.
const VOICE_COLUMNS = new Set([
  "how_you_talk",
  "swearing_level",
  "catchphrases",
  "words_never_say",
  "creators_brands_inspire",
  "creators_that_cringe",
]);
const CONTEXT_COLUMNS = new Set([
  "products_services",
  "ideal_client",
  "client_struggles",
  "client_2am_thoughts",
  "contrarian_beliefs",
  "industry_hates",
  "known_for",
]);

/**
 * The lean context for Interview mode: the client's voice, plus enough of who
 * they serve to ask a good follow-up. Both halves are used — the voice shapes
 * the interviewer's tone AND the finished script.
 */
export async function buildVoiceContext(db: Db, clientId: string): Promise<string> {
  const responses = await latestOnboarding(db, clientId);
  if (!responses) {
    return [
      "## THIS CREATOR",
      "No onboarding answers on file yet. Interview them in plain, warm, direct English,",
      "and write the script in the voice their own answers show you during the conversation.",
    ].join("\n");
  }

  const block = (title: string, columns: Set<string>) => {
    const fields = answered(responses, columns);
    if (fields.length === 0) return [];
    const out = [`## ${title}`];
    for (const f of fields) {
      out.push(`${f.label}:`);
      out.push(String(responses[f.column]).trim());
      out.push("");
    }
    return out;
  };

  const parts = [
    ...block("THIS CREATOR'S VOICE (the interview and the script both sound like this)", VOICE_COLUMNS),
    ...block("WHO THEY SERVE", CONTEXT_COLUMNS),
  ];

  const voice = responses.voice_transcript;
  if (typeof voice === "string" && voice.trim().length > 0) {
    parts.push("## VOICE SAMPLE (match this exact speaking voice, rhythm and word choice)");
    parts.push(voice.trim());
    parts.push("");
  }

  if (parts.length === 0) {
    return "## THIS CREATOR\nTheir onboarding has no voice answers yet. Keep your questions plain and direct.";
  }
  return parts.join("\n").trim();
}
