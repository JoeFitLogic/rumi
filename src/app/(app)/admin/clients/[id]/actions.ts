"use server";

import { revalidatePath } from "next/cache";
import { getActiveClient } from "@/lib/activeClient";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { provisionClientAccount, type ProvisionResult } from "@/lib/provision";
import type { AccountStatus } from "@/lib/types";

/** Gate every admin write server-side. Never trusts a client-supplied role. */
async function requireAdmin() {
  const ctx = await getActiveClient();
  if (!ctx || ctx.viewer.role !== "admin") {
    throw new Error("Not authorized: admin only.");
  }
  return ctx;
}

function revalidate(clientId: string) {
  revalidatePath(`/admin/clients/${clientId}`);
}

// ── account status (active/inactive) ─────────────────────────────────────
// Anon client + admin RLS (0003 rumi_profiles_admin_update).
export async function setAccountStatus(
  clientId: string,
  status: AccountStatus
): Promise<{ ok: true }> {
  await requireAdmin();
  if (status !== "active" && status !== "inactive") {
    throw new Error("Invalid account status.");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ account_status: status })
    .eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidate(clientId);
  return { ok: true };
}

// ── resend the set-password invite (fresh recovery link via Resend) ──────
// Service role (touches auth.users): reuses the provision.ts pattern, which
// get-or-creates then emails a token_hash recovery link.
export async function resendInvite(clientId: string): Promise<ProvisionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("profiles")
    .select("email, name")
    .eq("id", clientId)
    .maybeSingle();
  if (!client?.email) throw new Error("Client has no email on file.");
  return provisionClientAccount({
    email: client.email,
    name: client.name ?? "",
    sendInvite: true,
  });
}

// ── VA linking (writes linked_user_id on the VA's profile) ───────────────
export async function linkVa(
  vaId: string,
  clientId: string
): Promise<{ ok: true }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ linked_user_id: clientId })
    .eq("id", vaId);
  if (error) throw new Error(error.message);
  revalidate(clientId);
  return { ok: true };
}

export async function unlinkVa(
  vaId: string,
  clientId: string
): Promise<{ ok: true }> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ linked_user_id: null })
    .eq("id", vaId);
  if (error) throw new Error(error.message);
  revalidate(clientId);
  return { ok: true };
}

// ── create a VA account already linked to this client ────────────────────
export async function createVaForClient(
  email: string,
  name: string,
  clientId: string
): Promise<ProvisionResult> {
  await requireAdmin();
  const res = await provisionClientAccount({
    email,
    name,
    role: "va",
    linkedUserId: clientId,
    sendInvite: true,
  });
  revalidate(clientId);
  return res;
}

// ── onboarding answers (admin edit) — SERVICE ROLE ───────────────────────
// Bypasses RLS (0008 revoked the authenticated UPDATE grant so clients can't
// self-edit). Admin is gated server-side by requireAdmin(), and the write
// carries a MANDATORY owner filter (.eq("user_id", clientId)) plus the row id,
// per docs/production-db-guidelines.md — no filter would rewrite the whole table.
export async function saveOnboardingSection(
  onboardingId: string,
  clientId: string,
  patch: Record<string, string | null>
): Promise<{ ok: true }> {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("onboarding_responses")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", clientId) // mandatory owner filter
    .eq("id", onboardingId);
  if (error) throw new Error(error.message);
  revalidate(clientId);
  return { ok: true };
}

// ── voice transcript (admin paste) — SERVICE ROLE (see above) ────────────
export async function saveVoiceTranscript(
  onboardingId: string,
  clientId: string,
  text: string
): Promise<{ ok: true }> {
  await requireAdmin();
  const trimmed = text.trim();
  const admin = createAdminClient();
  const { error } = await admin
    .from("onboarding_responses")
    .update({
      voice_transcript: trimmed.length > 0 ? trimmed : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", clientId) // mandatory owner filter
    .eq("id", onboardingId);
  if (error) throw new Error(error.message);
  revalidate(clientId);
  return { ok: true };
}
