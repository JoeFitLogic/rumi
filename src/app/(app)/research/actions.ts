"use server";

import Anthropic from "@anthropic-ai/sdk";
import { getActiveClient } from "@/lib/activeClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseJsonArrayLoose } from "@/lib/research/parse";
import {
  buildRedditInput,
  startRedditRun,
  getRedditRun,
  getDatasetItems,
  TERMINAL_STATUSES,
} from "@/lib/research/apify";
import type {
  TranscriptCard,
  RedditQuote,
  ContentIdea,
  ResearchNotes,
  Video,
  Creator,
  CompetitorConfig,
} from "@/lib/research/types";
import {
  listVideos,
  listCreators,
  listConfigs,
  setVideoStar,
  deleteVideo as deleteVideoRow,
  clearOwnVideos,
} from "@/lib/research/competitor";
import {
  TRANSCRIPT_ANALYZER_SYSTEM,
  transcriptAnalyzerUser,
} from "@/lib/prompts/transcript-analyzer";
import {
  SUBREDDIT_PICKER_SYSTEM,
  subredditPickerUser,
  QUOTE_EXTRACTOR_SYSTEM,
  quoteExtractorUser,
} from "@/lib/prompts/reddit-scraper";
import {
  ideationSystem,
  ideationUser,
  type IdeationContext,
  type CompetitorVideo,
} from "@/lib/prompts/ideation-synthesis";

// Sonnet-tier, matching the repo's Script Studio convention (the n8n workflows
// ran claude-sonnet-4-20250514). Overridable via env without a code change.
const MODEL = process.env.RESEARCH_MODEL ?? "claude-sonnet-4-6";

// ── auth ────────────────────────────────────────────────────────────────────

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

// ── Claude helper ─────────────────────────────────────────────────────────────

function textFromMessage(msg: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("")
    .trim();
}

async function callClaude(
  system: string,
  userMessage: string,
  maxTokens: number
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

// A short, stable-ish client-side id. crypto.randomUUID is available in the
// Node runtime; each parsed card/quote gets one so React keys and selection
// state are stable.
function rid(): string {
  return crypto.randomUUID();
}

// ── STEP 2 — Transcript analyser ──────────────────────────────────────────────

export async function analyzeTranscript(
  clientId: string,
  transcript: string
): Promise<TranscriptCard[]> {
  await authorize(clientId);
  if (!transcript.trim()) throw new Error("Paste a transcript first.");

  const raw = await callClaude(
    TRANSCRIPT_ANALYZER_SYSTEM,
    transcriptAnalyzerUser(transcript),
    4000
  );

  const parsed = parseJsonArrayLoose<Omit<TranscriptCard, "id">>(raw);
  return parsed
    .filter((c) => c && typeof c.text === "string" && c.text.trim())
    .map((c) => ({
      id: rid(),
      category:
        c.category === "recurring_phrase" || c.category === "limiting_belief"
          ? c.category
          : "pain_point",
      text: c.text.trim(),
      context: typeof c.context === "string" ? c.context.trim() : "",
    }));
}

// ── STEP 3 — Reddit scraper (async run + polling) ─────────────────────────────

/** Call 1 (subreddit picker) → kick off the async Apify run. */
export async function startReddit(
  clientId: string,
  keywordsRaw: string,
  niche: string
): Promise<{ runId: string; datasetId: string; subreddits: string[]; keywords: string[] }> {
  await authorize(clientId);
  const keywords = keywordsRaw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (keywords.length === 0) throw new Error("Add at least one keyword.");

  // Call 1 — subreddit picker (max_tokens 500)
  const pickRaw = await callClaude(
    SUBREDDIT_PICKER_SYSTEM,
    subredditPickerUser(keywords, niche),
    500
  );
  const picked = parseJsonArrayLoose<string>(pickRaw)
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.replace(/^\/?r\//i, "").trim())
    .slice(0, 5);
  if (picked.length === 0) {
    throw new Error("Couldn't pick subreddits from those keywords. Try different ones.");
  }

  // Fix for the old bug: the picked subreddits ARE passed to the actor input.
  const run = await startRedditRun(buildRedditInput(picked));
  return {
    runId: run.id,
    datasetId: run.defaultDatasetId,
    subreddits: picked,
    keywords,
  };
}

/** Cheap poll — just the run status. */
export async function checkReddit(
  clientId: string,
  runId: string
): Promise<{ status: string; terminal: boolean }> {
  await authorize(clientId);
  const run = await getRedditRun(runId);
  return { status: run.status, terminal: TERMINAL_STATUSES.has(run.status) };
}

/** Shape scraped items into the prompt text (first 15 posts, 3 comments each,
 *  body truncated to 400 chars) — mirrors the n8n code node. */
function shapeRedditPosts(items: Record<string, unknown>[]): {
  text: string;
  count: number;
} {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const isPost = (it: Record<string, unknown>) =>
    it.dataType === "post" || (it.title != null && it.dataType !== "comment");
  const posts = items.filter(isPost).slice(0, 15);
  const comments = items.filter(
    (it) => it.dataType === "comment" || (it.body != null && it.title == null)
  );

  const lines: string[] = [];
  posts.forEach((p, i) => {
    const community =
      str(p.communityName) || str(p.subreddit) || str(p.parsedCommunityName) || "r/unknown";
    const pid = str(p.id) || str(p.parsedId) || str(p.postId);
    const matched = comments
      .filter((c) => {
        if (!pid) return false;
        const cp = str(c.postId);
        const pr = str(c.parentId);
        return cp === pid || (pr && pr.includes(pid));
      })
      .slice(0, 3);

    lines.push(`POST ${i + 1} (${community}):`);
    lines.push(`Title: ${str(p.title)}`);
    lines.push(`Body: ${str(p.body).slice(0, 400)}`);
    if (matched.length > 0) {
      lines.push("Comments:");
      for (const c of matched) lines.push(`  - "${str(c.body).slice(0, 400)}"`);
    }
    lines.push("");
  });

  return { text: lines.join("\n").trim(), count: posts.length };
}

/** Call 2 (quote extractor) — run once the scrape has SUCCEEDED. */
export async function extractRedditQuotes(
  clientId: string,
  datasetId: string,
  keywords: string[],
  subreddits: string[]
): Promise<RedditQuote[]> {
  await authorize(clientId);
  const items = await getDatasetItems(datasetId);
  const { text, count } = shapeRedditPosts(items);
  if (count === 0) {
    throw new Error("The scrape returned no posts. Try broader keywords.");
  }

  const raw = await callClaude(
    QUOTE_EXTRACTOR_SYSTEM,
    quoteExtractorUser(keywords, subreddits, text),
    4000
  );

  const parsed = parseJsonArrayLoose<Omit<RedditQuote, "id">>(raw);
  return parsed
    .filter((q) => q && typeof q.text === "string" && q.text.trim())
    .map((q) => ({
      id: rid(),
      text: q.text.trim(),
      subreddit: typeof q.subreddit === "string" ? q.subreddit : "",
      upvotes: typeof q.upvotes === "number" ? q.upvotes : 0,
      type: typeof q.type === "string" ? q.type : "pain_point",
      context: typeof q.context === "string" ? q.context.trim() : "",
      postTitle: typeof q.postTitle === "string" ? q.postTitle.trim() : "",
    }));
}

// ── STEP 4 — Ideation synthesis ───────────────────────────────────────────────

const CONTEXT_FIELDS = [
  "ideal_client",
  "client_types",
  "client_struggles",
  "client_misconceptions",
  "client_objections",
  "content_performed_well",
] as const;

/**
 * Build the ICP context server-side from the client's latest onboarding row.
 * NEVER trusted from the browser. Read with the service role + explicit owner
 * filter (the caller is already authorized for this client).
 */
async function buildIdeationContext(
  db: ReturnType<typeof createAdminClient>,
  clientId: string,
  clientName: string
): Promise<IdeationContext> {
  const { data } = await db
    .from("onboarding_responses")
    .select(CONTEXT_FIELDS.join(","))
    .eq("user_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const r = (data ?? {}) as Record<string, string | null>;
  const val = (k: string) => (r[k] ?? "").toString().trim();

  return {
    clientName: clientName || "this coach",
    idealClient: val("ideal_client") || val("client_types"),
    painPoints: val("client_struggles"),
    recurringLanguage: val("client_misconceptions"),
    limitingBeliefs: val("client_objections") || val("client_misconceptions"),
    contentWorking: val("content_performed_well"),
  };
}

export async function generateIdeas(
  clientId: string,
  notes: ResearchNotes,
  selectedVideos: CompetitorVideo[] = []
): Promise<ContentIdea[]> {
  const ctx = await authorize(clientId);
  const db = createAdminClient();
  const clientName = (ctx.activeClient.name ?? "").split(" ")[0] || "this coach";

  const context = await buildIdeationContext(db, clientId, clientName);
  const raw = await callClaude(
    ideationSystem(context),
    ideationUser(notes, selectedVideos ?? []),
    4000
  );

  const parsed = parseJsonArrayLoose<Partial<ContentIdea>>(raw);
  const ideas = parsed
    .filter((i) => i && typeof i.title === "string" && i.title.trim())
    .map((i) => ({
      title: (i.title ?? "").trim(),
      hook: (i.hook ?? "").trim(),
      pillar: (i.pillar ?? "").trim(),
      format: (i.format ?? "").trim(),
      source: (i.source ?? "").trim(),
      angle: (i.angle ?? "").trim(),
    }));

  if (ideas.length === 0) {
    throw new Error("The model returned no usable ideas. Try again.");
  }
  return ideas;
}

/** Save one or many ideas into content_ideas (owner column: client_id). No
 *  INSERT policy exists for authenticated on this Cleo table, so we write with
 *  the service role + an explicit client_id on every row. */
export async function saveIdeas(
  clientId: string,
  ideas: ContentIdea[]
): Promise<{ saved: number }> {
  await authorize(clientId);
  if (!ideas.length) return { saved: 0 };

  const db = createAdminClient();
  const rows = ideas.map((idea) => ({
    client_id: clientId,
    title: idea.title,
    hook: idea.hook,
    pillar: idea.pillar || null,
    format: idea.format || null,
    source: idea.source || null,
    angle: idea.angle || null,
    status: "idea",
  }));

  const { error } = await db.from("content_ideas").insert(rows);
  if (error) throw new Error(error.message);
  return { saved: rows.length };
}

export async function saveIdea(
  clientId: string,
  idea: ContentIdea
): Promise<{ saved: number }> {
  return saveIdeas(clientId, [idea]);
}

// ── STEP 5 — Competitor research (per-client, migration 0012) ─────────────────
// Reads show the client's own rows + legacy/global (NULL) rows; writes only ever
// touch the client's OWN rows (enforced in src/lib/research/competitor.ts).
// The scrape/pipeline/CRUD WRITE side is intentionally NOT here yet — it needs
// the SMAI client_id contract (held until the SMAI repo is in reference/).

export async function listCompetitorVideos(clientId: string): Promise<Video[]> {
  await authorize(clientId);
  return listVideos(clientId);
}

export async function listCompetitorCreators(
  clientId: string
): Promise<Creator[]> {
  await authorize(clientId);
  return listCreators(clientId);
}

export async function listCompetitorConfigs(
  clientId: string
): Promise<CompetitorConfig[]> {
  await authorize(clientId);
  return listConfigs(clientId);
}

export async function starVideo(
  clientId: string,
  videoId: string,
  starred: boolean
): Promise<{ changed: number }> {
  await authorize(clientId);
  return { changed: await setVideoStar(clientId, videoId, starred) };
}

export async function removeVideo(
  clientId: string,
  videoId: string
): Promise<{ changed: number }> {
  await authorize(clientId);
  return { changed: await deleteVideoRow(clientId, videoId) };
}

export async function clearVideos(
  clientId: string
): Promise<{ cleared: number }> {
  await authorize(clientId);
  return { cleared: await clearOwnVideos(clientId) };
}
