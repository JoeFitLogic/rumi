"use server";

import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { getActiveClient } from "@/lib/activeClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildVoiceContext } from "@/lib/scriptContext";
import { STORY_EXTRACTOR } from "@/lib/prompts/story-extractor";
import {
  INTERVIEW_OPENER,
  extractScript,
  type InterviewMessage,
} from "@/lib/interview";
import type { ScriptRow } from "@/lib/scripts";

// Interview mode — the conversational story extractor.
//
// Its own "use server" file so the form flow's actions.ts is untouched apart
// from the shared-context import. The form stays the quick path; this is the
// slow one, and they share nothing but the client context and the library.
//
// Same model knob as the form (SCRIPT_MODEL), so one env var moves both.
const MODEL = process.env.SCRIPT_MODEL ?? "claude-sonnet-4-6";
// A turn is one question, or at the end the IMF plus a 200-280 word script.
const MAX_TOKENS = 2000;

// The browser holds the thread and sends all of it every turn — that is how the
// Messages API works, and it is what keeps the model aware of the story type,
// what has been answered and what is still missing. These caps stop a runaway
// or a pasted essay turning into an unbounded request.
const MAX_TURNS = 60;
const MAX_MESSAGE_CHARS = 6000;

const SELECT =
  "id, user_id, topic, content_type, hook_type, pillar, audience_stage, length, additional_context, generated_script, status, created_at";

// The interview never asks for a format or a pillar, so rather than invent an
// answer to a question nobody was asked, every interview script is saved as a
// spoken story at the spec's own 45-60 second target.
const INTERVIEW_CONTENT_TYPE = "storytelling";
const INTERVIEW_PILLAR = "connect";
const INTERVIEW_LENGTH = "60s";

export interface InterviewTurnResult {
  /** The full assistant message, appended to the thread verbatim. */
  reply: string;
  /** The finished script, if this turn produced one. */
  script: string | null;
  /** The reply carried a script but its closing marker was missing. */
  markersMissing: boolean;
}

/**
 * Re-validate the caller against the clientId the browser sent. NEVER trust the
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

function textFromMessage(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

/**
 * One turn of the interview. The whole thread goes up each time, with the
 * extraction spec and the client's voice as the system prompt.
 *
 * Both system blocks are cached. The spec alone is ~9.6k tokens and would
 * otherwise be re-billed at full rate on every one of ~20 turns; `cache_control`
 * makes the repeat reads a fraction of that. The messages array sits outside the
 * cached prefix on purpose, because it changes every turn — cache is a prefix
 * match, so anything volatile has to come last.
 */
export async function interviewTurn(input: {
  clientId: string;
  messages: InterviewMessage[];
}): Promise<InterviewTurnResult> {
  await authorize(input.clientId);

  const history: Anthropic.MessageParam[] = (input.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content.trim().length > 0)
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

  // The API requires the thread to open on a user turn, and this one opens with
  // Rumi asking the story type — so a synthetic user message leads, both on the
  // very first turn and on every turn after it (the thread still starts with
  // Rumi's question).
  const needsOpener = history.length === 0 || history[0].role === "assistant";
  const messages: Anthropic.MessageParam[] = needsOpener
    ? [{ role: "user", content: INTERVIEW_OPENER }, ...history]
    : history;

  const db = createAdminClient();
  const voice = await buildVoiceContext(db, input.clientId);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: "text", text: STORY_EXTRACTOR, cache_control: { type: "ephemeral" } },
      { type: "text", text: voice, cache_control: { type: "ephemeral" } },
    ],
    messages,
  });

  const reply = textFromMessage(msg);
  if (!reply) throw new Error("Rumi didn't reply. Try again.");
  const { script, markersMissing } = extractScript(reply);
  return { reply, script, markersMissing };
}

/**
 * Save a finished interview script into the same `scripts` library the form
 * flow writes to, so it filters, refines and status-tracks like any other row.
 */
export async function saveInterviewScript(input: {
  clientId: string;
  script: string;
  /** The IMF Idea line, used as the library title. */
  topic: string;
  /** e.g. "01 THE WIN" — recorded in additional_context, not in a column. */
  storyType: string;
  /** The locked IMF block, kept with the script for context. */
  imf?: string;
}): Promise<ScriptRow> {
  await authorize(input.clientId);
  if (!input.script.trim()) throw new Error("There's no script to save yet.");

  const db = createAdminClient();
  const note =
    `Interview${input.storyType.trim() ? ` · ${input.storyType.trim()}` : ""}` +
    (input.imf?.trim() ? `\n\n${input.imf.trim()}` : "");

  // hook_type and audience_stage stay null, matching the form flow: a blank
  // column is honest, a made-up value pretends the client chose something.
  const { data, error } = await db
    .from("scripts")
    .insert({
      user_id: input.clientId,
      topic: input.topic.trim().slice(0, 300) || "Interview script",
      content_type: INTERVIEW_CONTENT_TYPE,
      hook_type: null,
      pillar: INTERVIEW_PILLAR,
      audience_stage: null,
      length: INTERVIEW_LENGTH,
      additional_context: note,
      generated_script: input.script.trim(),
      status: "drafted",
    })
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);
  revalidatePath("/script-studio");
  return data as ScriptRow;
}
