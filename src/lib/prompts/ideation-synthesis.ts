// Ideation Synthesis (Research Step 4) — prompt VERBATIM from the n8n
// "ideation-synthesis" workflow (reference/prompts/ideation-synthesis.md).
// Model in n8n: claude-sonnet-4-20250514, max_tokens 4000.

export interface IdeationContext {
  clientName: string;
  idealClient: string;
  painPoints: string;
  recurringLanguage: string;
  limitingBeliefs: string;
  contentWorking: string;
}

export interface IdeationNotes {
  analytics: string;
  clients: string;
  forums: string;
  trends: string;
}

/** Competitor video shape (Session 8 wires real values; empty for now). */
export interface CompetitorVideo {
  creator: string;
  views: number | string;
  analysis: string;
  newConcepts: string;
}

export function ideationSystem(context: IdeationContext): string {
  return `You are a content ideation assistant for a personal brand coach named ${context.clientName}.

Your job: analyse research notes and competitor video data, then generate specific content ideas calibrated to their exact ideal client.

IDEAL CLIENT CONTEXT:
${context.idealClient || "Not provided"}

CORE PAIN POINTS:
${context.painPoints || "Not provided"}

LANGUAGE THEIR AUDIENCE USES:
${context.recurringLanguage || "Not provided"}

LIMITING BELIEFS TO ADDRESS:
${context.limitingBeliefs || "Not provided"}

CONTENT ALREADY WORKING FOR THEM:
${context.contentWorking || "Not provided"}

RULES:
- Every idea must trace directly back to something in the research notes or competitor data
- Use the exact language the ideal client uses — not polished marketing copy
- Hooks must be specific and psychographic — they should feel like the audience's inner monologue
- Never generate generic ideas that could apply to any coach
- If research notes are sparse, lean harder on competitor gaps and ICP context
- Return ONLY valid JSON — no preamble, no markdown fences, no explanation

Return a JSON array of 8-10 content ideas. Each object:
{
  "title": "short descriptive working title",
  "hook": "the full opening line exactly as it would appear on screen or be spoken",
  "pillar": "Personal" or "Proof" or "Perspective",
  "format": "Reel" or "Carousel" or "B-roll",
  "source": "Analytics" or "Client Interactions" or "External Forums" or "Competitor Audit" or "Trends" or "ICP Context",
  "angle": "1-2 sentences on the strategic angle and why it will land with this specific audience"
}`;
}

function competitorSummaryBlock(videos: CompetitorVideo[]): string {
  if (!videos.length) return "None selected.";
  return videos
    .map(
      (v, i) =>
        `Video ${i + 1} (@${v.creator}):
Views: ${v.views}
Analysis: ${v.analysis}
New concept ideas: ${v.newConcepts}`
    )
    .join("\n\n");
}

export function ideationUser(
  notes: IdeationNotes,
  selectedVideos: CompetitorVideo[]
): string {
  const hasNotes = Boolean(
    notes.analytics.trim() ||
      notes.clients.trim() ||
      notes.forums.trim() ||
      notes.trends.trim()
  );
  const competitorSummary = competitorSummaryBlock(selectedVideos);

  return `RESEARCH NOTES:

ANALYTICS & OWN DATA:
${notes.analytics || "Not provided"}

CLIENT INTERACTIONS & CALL TRANSCRIPTS:
${notes.clients || "Not provided"}

EXTERNAL FORUMS (Reddit, YouTube, Facebook groups):
${notes.forums || "Not provided"}

TRENDS & CULTURAL CONTEXT:
${notes.trends || "Not provided"}

COMPETITOR VIDEO ANALYSIS (${selectedVideos.length} videos selected):
${competitorSummary}

Generate ${hasNotes ? "8-10" : "6-8"} content ideas now.`;
}
