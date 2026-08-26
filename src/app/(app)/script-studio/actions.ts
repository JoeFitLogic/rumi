"use server";

import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { getActiveClient } from "@/lib/activeClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { ONBOARDING_FIELDS, GROUP_ORDER } from "@/lib/onboarding";
import { SCRIPT_GENERATOR } from "@/lib/prompts/script-generator";
import { HOOK_GENERATOR, parseHooks } from "@/lib/prompts/hook-generator";
import {
  CONTENT_TYPES,
  PILLARS,
  HOOK_COUNT,
  labelFor,
  type ScriptRow,
} from "@/lib/scripts";

// Sonnet-tier, matching the n8n "Script-Generator" node. Overridable via env
// without a code change (same pattern as STRATEGY_MODEL for the strategy task).
const MODEL = process.env.SCRIPT_MODEL ?? "claude-sonnet-4-6";
const MAX_TOKENS = 2500;
// Ten one-line hooks is a small answer; no need to pay for a 2500-token ceiling.
const HOOK_MAX_TOKENS = 900;

const SELECT =
  "id, user_id, topic, content_type, hook_type, pillar, audience_stage, length, additional_context, generated_script, status, created_at";

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
 *
 * Both generation passes (hooks and script) share this, so the ten hooks and
 * the script that follows are written off the exact same voice data.
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

async function callClaude(
  system: string,
  userMessage: string,
  maxTokens: number = MAX_TOKENS
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = textFromMessage(msg);
  if (!text) throw new Error("The model returned an empty response. Try again.");
  return text;
}

/** The brief both passes share: format, pillar, topic, the client's own notes. */
function briefBlock(input: {
  contentType: string;
  pillar: string;
  topic: string;
  additionalContext?: string;
}): string[] {
  const ct = CONTENT_TYPES.find((c) => c.value === input.contentType);
  return [
    `- Content type: ${input.contentType}${ct?.description ? ` (${ct.description})` : ""}`,
    `- Content pillar: ${labelFor(PILLARS, input.pillar)}`,
    "",
    "Topic / brief from the client:",
    input.topic.trim(),
    input.additionalContext && input.additionalContext.trim()
      ? `\nAdditional context:\n${input.additionalContext.trim()}`
      : "",
  ].filter((l) => l !== "");
}

// ── Step 1: hooks ────────────────────────────────────────────────────────────

export interface HookInput {
  clientId: string;
  topic: string;
  contentType: string;
  pillar: string;
  additionalContext?: string;
}

/**
 * Write HOOK_COUNT hooks for this topic in the client's voice. Nothing is
 * saved — hooks are a throwaway shortlist the client picks from, and only the
 * script they choose becomes a `scripts` row.
 */
export async function generateHooks(input: HookInput): Promise<string[]> {
  await authorize(input.clientId);
  if (!input.topic.trim()) throw new Error("Add a topic first.");

  const db = createAdminClient();
  const context = await buildClientContext(db, input.clientId);

  const brief = [
    `Now write ${HOOK_COUNT} hooks for this brief. Output only the ${HOOK_COUNT} numbered lines.`,
    "",
    ...briefBlock(input),
  ].join("\n");

  const raw = await callClaude(HOOK_GENERATOR, `${context}\n\n---\n\n${brief}`, HOOK_MAX_TOKENS);
  const hooks = parseHooks(raw, HOOK_COUNT);
  if (hooks.length === 0) {
    throw new Error("Rumi didn't return any usable hooks. Try again.");
  }
  return hooks;
}

// ── Step 2: the script, written to the chosen hook ───────────────────────────

export interface GenerateInput {
  clientId: string;
  topic: string;
  contentType: string;
  pillar: string;
  length: string;
  /** The one hook the client picked out of generateHooks' shortlist. */
  chosenHook: string;
  additionalContext?: string;
}

function scriptBrief(input: Omit<GenerateInput, "clientId">): string {
  return [
    "Now write ONE script with these parameters. Follow the FORMAT-SPECIFIC OUTPUT rules for the content type exactly.",
    "",
    ...briefBlock(input),
    "",
    "THE HOOK IS ALREADY CHOSEN. The client picked this line, so the script is written to its angle:",
    input.chosenHook.trim(),
    "",
    "Open on that hook. Use it as the HOOK beat close to word for word, tightening it only if it does not scan out loud. Do not swap it for a different angle, and do not write a second hook in front of it. BUILD, DELIVER and CLOSE all have to pay off the promise this line makes.",
    "",
    `- Target length: ${input.length}`,
  ].join("\n");
}

/** Generate a new script and save it to the shared `scripts` table (status 'drafted'). */
export async function generateScript(input: GenerateInput): Promise<ScriptRow> {
  await authorize(input.clientId);
  if (!input.topic.trim()) throw new Error("Add a topic first.");
  if (!input.chosenHook.trim()) throw new Error("Pick a hook first.");

  const db = createAdminClient();
  const context = await buildClientContext(db, input.clientId);
  const userMessage = `${context}\n\n---\n\n${scriptBrief(input)}`;

  const script = await callClaude(SCRIPT_GENERATOR, userMessage);

  // hook_type and audience_stage are legacy Cleo columns whose selectors were
  // removed from the form. Written null rather than a made-up value so new rows
  // are honestly blank instead of pretending the client chose something.
  const { data, error } = await db
    .from("scripts")
    .insert({
      user_id: input.clientId,
      topic: input.topic.trim(),
      content_type: input.contentType,
      hook_type: null,
      pillar: input.pillar,
      audience_stage: null,
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
    "Revise it based on this note. Keep the same content type and its format-specific output rules exactly. Keep the hook's angle unless the note asks you to change it. Output only the revised script, no preamble.",
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
