"use server";

import { revalidatePath } from "next/cache";
import { getActiveClient } from "@/lib/activeClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { toPayload, type CheckinRow, type FormValues } from "@/lib/checkin";

const SELECT = "*";

/**
 * Re-validate the caller against the clientId the browser sent. Never trust the
 * raw id — getActiveClient re-checks the session and refuses ?as= for non-admins.
 */
async function authorize(clientId: string) {
  const ctx = await getActiveClient(clientId);
  if (!ctx) throw new Error("Not signed in.");
  if (ctx.activeClientId !== clientId) {
    throw new Error("Not authorized for this client.");
  }
  return ctx;
}

const WEEK_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface SubmitCheckinInput {
  clientId: string;
  weekStarting: string;
  values: FormValues;
}

/**
 * Upsert the week's check-in. One row per (user_id, week_starting): resubmitting
 * the same week updates the existing row. Service-role + explicit owner filter
 * per docs/production-db-guidelines.md.
 */
export async function submitCheckin(input: SubmitCheckinInput): Promise<CheckinRow> {
  await authorize(input.clientId);
  if (!WEEK_RE.test(input.weekStarting)) {
    throw new Error("Invalid week.");
  }

  const payload = toPayload(input.values);
  const db = createAdminClient();

  const { data, error } = await db
    .from("checkin_responses")
    .upsert(
      {
        user_id: input.clientId,
        week_starting: input.weekStarting,
        ...payload,
      },
      { onConflict: "user_id,week_starting" }
    )
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/check-in");
  return data as CheckinRow;
}
