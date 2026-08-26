import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getActiveClient } from "@/lib/activeClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasVoiceSample } from "@/lib/voice";
import type { ScriptRow } from "@/lib/scripts";
import { SELECT_IDEA, type ContentIdeaRow } from "@/lib/contentBank";
import ScriptStudio from "./ScriptStudio";

// Two-panel Script Studio: generator (left) + saved library (right).
// Everything is scoped to the active client via getActiveClient() and the
// admin switcher's ?as= param.
export default async function ScriptStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const asParam = typeof params.as === "string" ? params.as : null;
  const prefillTopic = typeof params.topic === "string" ? params.topic : "";

  const ctx = await getActiveClient(asParam);
  if (!ctx) redirect("/login");

  const isAdmin = ctx.viewer.role === "admin";
  const firstName = (ctx.activeClient.name ?? "").split(" ")[0] || "this client";

  // Library read: service role + explicit owner filter. The caller is already
  // authorized for activeClientId, and this avoids the shared-DB RLS ambiguity
  // on `scripts` (old Cleo rows have status "saved" and null user_id elsewhere).
  const db = createAdminClient();
  const [{ data: rows }, { data: ideaRows }, hasVoice] = await Promise.all([
    db
      .from("scripts")
      .select(
        "id, user_id, topic, content_type, hook_type, pillar, audience_stage, length, additional_context, generated_script, status, created_at"
      )
      .eq("user_id", ctx.activeClientId)
      .order("created_at", { ascending: false })
      .limit(500),
    // Content Bank ideas — Cleo-shared content_ideas, owner column client_id.
    db
      .from("content_ideas")
      .select(SELECT_IDEA)
      .eq("client_id", ctx.activeClientId)
      .order("created_at", { ascending: false })
      .limit(500),
    hasVoiceSample(ctx.activeClientId),
  ]);

  return (
    <div>
      {/* Niamh's line, attributed to Rumi. Her wording promised "one of the
          provided prompts" — there is no prompt-starter library yet, so the ask
          is worded as context instead of pointing at something that isn't there.
          Restore the original once starters exist (Niamh's call).
          The em dash stays: the no-em-dash rule is a SCRIPT rule
          (script-generator.ts), not a UI-copy rule, and the app's own chrome
          already uses them. */}
      <PageHeader
        eyebrow="Script Studio"
        title="Generate Your Script"
        description={
          "\u201CRemember guys, I\u2019m AI, not a mindreader (not yet) \u2014 give me as " +
          "much context as you can and I\u2019ll write what\u2019s actually on your " +
          "mind\u201D \u2014 Rumi"
        }
      />
      <ScriptStudio
        clientId={ctx.activeClientId}
        isAdmin={isAdmin}
        hasVoice={hasVoice}
        clientFirstName={firstName}
        initialScripts={(rows ?? []) as ScriptRow[]}
        initialIdeas={(ideaRows ?? []) as ContentIdeaRow[]}
        prefillTopic={prefillTopic}
      />
    </div>
  );
}
