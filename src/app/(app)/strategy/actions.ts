"use server";

import { revalidatePath } from "next/cache";
import { tasks } from "@trigger.dev/sdk";
import { getActiveClient } from "@/lib/activeClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { releaseStrategy } from "@/lib/strategy-release";
import type { GenerateStrategyPayload } from "@/trigger/generate-strategy";

async function requireAdmin() {
  const ctx = await getActiveClient();
  if (!ctx || ctx.viewer.role !== "admin") {
    throw new Error("Not authorized: admin only.");
  }
  return ctx;
}

/** Save an admin edit to a section's markdown. */
export async function saveSection(sectionId: string, content: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from("strategy_sections")
    .update({ content })
    .eq("id", sectionId);
  if (error) throw new Error(error.message);
  revalidatePath("/strategy");
  return { ok: true };
}

/** Release a completed strategy to the client now (stamps released_at, emails). */
export async function releaseNow(strategyId: string) {
  await requireAdmin();
  const res = await releaseStrategy(strategyId);
  revalidatePath("/strategy");
  return res;
}

/** Regenerate: delete existing sections, reset to pending, re-run the task. */
export async function regenerate(strategyId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { data: strategy } = await admin
    .from("strategies")
    .select("id, user_id, onboarding_id")
    .eq("id", strategyId)
    .maybeSingle();
  if (!strategy) throw new Error("Strategy not found");

  await admin.from("strategy_sections").delete().eq("strategy_id", strategyId);
  await admin
    .from("strategies")
    .update({ status: "pending", completed_at: null })
    .eq("id", strategyId);

  const payload: GenerateStrategyPayload = {
    strategyId,
    userId: strategy.user_id,
    onboardingId: strategy.onboarding_id,
  };
  await tasks.trigger("generate-strategy", payload);

  revalidatePath("/strategy");
  return { ok: true };
}
