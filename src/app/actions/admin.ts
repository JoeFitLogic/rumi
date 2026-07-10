"use server";

import { getActiveClient } from "@/lib/activeClient";
import { provisionClientAccount, type ProvisionResult } from "@/lib/provision";

export type CreateClientAccountResult = ProvisionResult;

/**
 * Invite-only account creation. Admin-only.
 *
 * Verifies the caller is an admin, then delegates to provisionClientAccount
 * (get-or-create auth user with a random password, upsert an active client
 * profile, and email a token_hash set-password link via Resend). This is the
 * same helper /api/intake uses for GHL-driven onboarding.
 */
export async function createClientAccount(
  email: string,
  name: string
): Promise<CreateClientAccountResult> {
  const ctx = await getActiveClient();
  if (!ctx || ctx.viewer.role !== "admin") {
    throw new Error("Not authorized: admin only.");
  }
  return provisionClientAccount({ email, name, sendInvite: true });
}
