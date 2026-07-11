"use server";

import { revalidatePath } from "next/cache";
import { getActiveClient } from "@/lib/activeClient";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Update the signed-in user's own display name (profiles.name).
 *
 * Service role with a hard `.eq("id", viewer.id)` filter: this is the user's
 * OWN row and there is no guaranteed own-row UPDATE policy on profiles, so anon
 * would risk a silent no-op. The id comes from the session, never the client.
 */
export async function updateDisplayName(
  name: string
): Promise<{ ok: true }> {
  const ctx = await getActiveClient();
  if (!ctx) throw new Error("Not signed in.");

  const clean = name.trim();
  if (!clean) throw new Error("Name can't be empty.");
  if (clean.length > 120) throw new Error("That name is too long.");

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ name: clean })
    .eq("id", ctx.viewer.id); // own row only
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  return { ok: true };
}
