"use server";

import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { getActiveClient } from "@/lib/activeClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { ONBOARDING_FIELDS, GROUP_ORDER } from "@/lib/onboarding";
import { SCRIPT_GENERATOR } from "@/lib/prompts/script-generator";
import {
  CONTENT_TYPES,
  HOOK_TYPES,
  PILLARS,
  AUDIENCE_STAGES,
  labelFor,
  type ScriptRow,
} from "@/lib/scripts";

// Sonnet-tier, matching the n8n "Script-Generator" node. Overridable via env
// without a code change (same pattern as STRATEGY_MODEL for the strategy task).
const MODEL = process.env.SCRIPT_MODEL ?? "claude-sonnet-4-6";
const MAX_TOKENS = 2500;

const SELECT =
  "id, user_id, topic, content_type, hook_type, pillar, audience_stage, length, additional_context, generated_script, status, created_at";

export interface GenerateInput {
  clientId: string;
  topic: string;
  contentType: string;
  hookType: string;
  pillar: string;
  audienceStage: string;
  length: string;
  additionalContext?: string;
}

/**
 * Re-validate the caller against the clientId the browser sent. NEVER trust the
 * raw id — getActiveClient re-checks the session and refuses ?as= for non-admins.
 * Any non-null context is authorized to act on activeClientId.
 */
async function authorize(clientId: string) {
  const ctx = await getActiveClient(clientId);
  if (!ctx) throw new Error("Not signed in.");
  if (ctx.activeClientId !== clientId) {
    throw new Error("Not authorized for this client.");
  }
  return ctx;
}

function textFromMessage(msg: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

/**
 * Build the client-context block from their latest onboarding row, INCLUDING
 * the voice sample (voice_transcript) so the script sounds like them. Read with
 * the service role + explicit owner filter — the caller is already authorized
 * for this client, and this dodges the shared-DB RLS ambiguity on `scripts`.
 */
async function buildClientContext(
  db: ReturnType<typeof createAdminClient>,
  clientId: string
): Promise<string> {
  const { data: onboarding } = await db
    .from("onboarding_responses")
    .select("*")
    .eq("user_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!onboarding) return "No onboarding answers on file for this client yet.";

  const responses = onboarding as Record<string, unknown>;
  const parts: string[] = ["Here is everything we know about this client. Write the script in THEIR voice, from these answers up.", ""];

  for (const group of GROUP_ORDER) {
    const answered = ONBOARDING_FIELDS.filter((f) => f.group === group).filter((f) => {
      const v = responses[f.column];
      return v !== null && v !== undefined && String(v).trim().length > 0;
    });
    if (answered.length === 0) continue;
    parts.push(`## ${group}`);
    for (const f of answered) {
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

function briefLine(input: {
  contentType: string;
  hookType: string;
  pillar: string;
  audienceStage: string;
  length: string;
  topic: string;
  additionalContext?: string;
}): string {
  const ct = CONTENT_TYPES.find((c) => c.value === input.contentType);
  return [
    "Now write ONE script with these parameters. Follow the FORMAT-SPECIFIC OUTPUT rules for the content type exactly.",
    "",
    `- Content type: ${input.contentType}${ct?.description ? ` (${ct.description})` : ""}`,
    `- Hook type: ${labelFor(HOOK_TYPES, input.hookType)}`,
    `- Content pillar: ${labelFor(PILLARS, input.pillar)}`,
    `- Audience stage: ${labelFor(AUDIENCE_STAGES, input.audienceStage)}`,
    `- Target length: ${input.length}`,
    "",
    "Topic / brief from the client:",
    input.topic.trim(),
    input.additionalContext && input.additionalContext.trim()
      ? `\nAdditional context:\n${input.additionalContext.trim()}`
      : "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

async function callClaude(system: string, userMessage: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = textFromMessage(msg);
  if (!text) throw new Error("The model returned an empty script. Try again.");
  return text;
}

/** Generate a new script and save it to the shared `scripts` table (status 'drafted'). */
export async function generateScript(input: GenerateInput): Promise<ScriptRow> {
  await authorize(input.clientId);
  if (!input.topic.trim()) throw new Error("Add a topic first.");

  const db = createAdminClient();
  const context = await buildClientContext(db, input.clientId);
  const userMessage = `${context}\n\n---\n\n${briefLine(input)}`;

  const script = await callClaude(SCRIPT_GENERATOR, userMessage);

  const { data, error } = await db
    .from("scripts")
    .insert({
      user_id: input.clientId,
      topic: input.topic.trim(),
      content_type: input.contentType,
      hook_type: input.hookType,
      pillar: input.pillar,
      audience_stage: input.audienceStage,
      length: input.length,
      additional_context: input.additionalContext?.trim() || null,
      generated_script: script,
      status: "drafted",
    })
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/script-studio");
  return data as ScriptRow;
}

export interface RefineInput {
  clientId: string;
  scriptId: string;
  refinement: string;
}

/** Iterate on an existing script: previous script + a refinement note → revised script. */
export async function refineScript(input: RefineInput): Promise<ScriptRow> {
  await authorize(input.clientId);
  if (!input.refinement.trim()) throw new Error("Add a refinement note first.");

  const db = createAdminClient();
  const { data: existing } = await db
    .from("scripts")
    .select(SELECT)
    .eq("id", input.scriptId)
    .eq("user_id", input.clientId) // owner filter — never touch another client's row
    .maybeSingle();
  if (!existing) throw new Error("Script not found.");
  const prev = existing as ScriptRow;

  const context = await buildClientContext(db, input.clientId);
  const userMessage = [
    context,
    "",
    "---",
    "",
    `Here is a ${prev.content_type ?? "short-form"} script you wrote earlier for this client:`,
    '"""',
    prev.generated_script ?? "",
    '"""',
    "",
    "Revise it based on this note. Keep the same content type and its format-specific output rules exactly. Output only the revised script, no preamble.",
    "",
    `Refinement note: ${input.refinement.trim()}`,
  ].join("\n");

  const revised = await callClaude(SCRIPT_GENERATOR, userMessage);

  const { data, error } = await db
    .from("scripts")
    .update({ generated_script: revised })
    .eq("id", input.scriptId)
    .eq("user_id", input.clientId)
    .select(SELECT)
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/script-studio");
  return data as ScriptRow;
}

/** Inline status change (idea → drafted → filmed → published). */
export async function updateScriptStatus(
  clientId: string,
  scriptId: string,
  status: string
): Promise<{ ok: true }> {
  await authorize(clientId);
  const db = createAdminClient();
  const { error } = await db
    .from("scripts")
    .update({ status })
    .eq("id", scriptId)
    .eq("user_id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/script-studio");
  return { ok: true };
}

export async function deleteScript(
  clientId: string,
  scriptId: string
): Promise<{ ok: true }> {
  await authorize(clientId);
  const db = createAdminClient();
  const { error } = await db
    .from("scripts")
    .delete()
    .eq("id", scriptId)
    .eq("user_id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/script-studio");
  return { ok: true };
}
