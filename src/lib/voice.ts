import { createClient } from "@/lib/supabase/server";

/**
 * Does this client have a usable voice sample on their latest onboarding row?
 *
 * A voice sample (onboarding_responses.voice_transcript) lets generation match
 * the client's real speaking voice. Session 4's Script Studio calls this to warn
 * admins when generating without one.
 *
 * Reads through the anon client under RLS, so it only ever sees a row the caller
 * is entitled to (admin, the client themselves, or the client's VA). Anyone else
 * gets null → false.
 */
export async function hasVoiceSample(clientId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_responses")
    .select("voice_transcript")
    .eq("user_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const v = (data as { voice_transcript?: string | null } | null)?.voice_transcript;
  return typeof v === "string" && v.trim().length > 0;
}
