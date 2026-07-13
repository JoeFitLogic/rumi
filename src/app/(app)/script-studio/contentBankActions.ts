"use server";

import { revalidatePath } from "next/cache";
import { getActiveClient } from "@/lib/activeClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { SELECT_IDEA, type ContentIdeaRow } from "@/lib/contentBank";

// Content Bank server actions over the Cleo-shared `content_ideas` table.
// Owner column is `client_id`. Every read/write goes through the service role
// with an explicit `client_id` owner filter — no anon RLS is relied on, and no
// mutation can stray to another client's or Cleo's rows (same pattern as the
// Session-7 saveIdeas path).

async function authorize(clientId: string) {
  const ctx = await getActiveClient(clientId);
  if (!ctx) throw new Error("Not signed in.");
  if (ctx.activeClientId !== clientId) {
    throw new Error("Not authorized for this client.");
  }
  return ctx;
}

export async function listIdeas(clientId: string): Promise<ContentIdeaRow[]> {
  await authorize(clientId);
  const db = createAdminClient();
  const { data, error } = await db
    .from("content_ideas")
    .select(SELECT_IDEA)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as ContentIdeaRow[];
}

export async function updateIdeaStatus(
  clientId: string,
  ideaId: string,
  status: string
): Promise<{ ok: true }> {
  await authorize(clientId);
  const db = createAdminClient();
  const { error } = await db
    .from("content_ideas")
    .update({ status })
    .eq("id", ideaId)
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/script-studio");
  return { ok: true };
}

export async function updateIdeaNotes(
  clientId: string,
  ideaId: string,
  notes: string
): Promise<{ ok: true }> {
  await authorize(clientId);
  const db = createAdminClient();
  const { error } = await db
    .from("content_ideas")
    .update({ notes: notes.trim() || null })
    .eq("id", ideaId)
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/script-studio");
  return { ok: true };
}

export async function deleteIdea(
  clientId: string,
  ideaId: string
): Promise<{ ok: true }> {
  await authorize(clientId);
  const db = createAdminClient();
  const { error } = await db
    .from("content_ideas")
    .delete()
    .eq("id", ideaId)
    .eq("client_id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/script-studio");
  return { ok: true };
}
