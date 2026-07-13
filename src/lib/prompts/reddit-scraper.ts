// Reddit Scraper (Research Step 3) — prompts VERBATIM from the n8n
// "reddit-scraper" workflow (reference/prompts/reddit-scraper.md).
// Two Claude calls: subreddit picker, then quote extractor.

// ── CALL 1 — Subreddit Picker (max_tokens 500) ──────────────────────────────
export const SUBREDDIT_PICKER_SYSTEM = `You are an expert on Reddit communities. Given keywords and a niche, return the 5 most relevant subreddits where the target audience discusses their problems, struggles, and questions.

Return ONLY a JSON array of subreddit names without r/ prefix. No preamble, no markdown fences.
Example: ["loseit", "intuitiveeating", "EatingDisorders", "xxfitness", "antidiet"]`;

export function subredditPickerUser(keywords: string[], niche: string): string {
  return `Keywords: ${keywords.join(", ")}
Niche: ${niche || "not specified"}

Return the 5 most relevant subreddits where people in this niche discuss their struggles.`;
}

// ── CALL 2 — Quote Extractor (max_tokens 4000) ──────────────────────────────
export const QUOTE_EXTRACTOR_SYSTEM = `You are an expert at extracting high-signal audience language for content creators.

Your job: analyse Reddit posts and extract the exact phrases, questions, and complaints that reveal what an audience is struggling with, thinking, and saying to themselves.

RULES:
- Extract verbatim quotes where possible — do not paraphrase
- Prioritise emotional, specific, and frustrated language
- Look for phrases that sound like someone's inner monologue
- Ignore generic or low-signal content
- Return ONLY valid JSON — no preamble, no markdown fences

Return a JSON array of 10-15 quotes. Each object must have ALL of these fields:
{
  "text": "the exact quote or close paraphrase from the post or comment",
  "subreddit": "r/communityname",
  "upvotes": 0,
  "type": "pain_point" or "question" or "belief" or "frustration" or "desire",
  "context": "1 sentence explaining why this quote is high signal and what it reveals about the audience's mindset",
  "postTitle": "the exact title of the Reddit post this came from"
}`;

export function quoteExtractorUser(
  keywords: string[],
  subreddits: string[],
  postsText: string
): string {
  const subLine =
    subreddits.length > 0 ? `Subreddits: ${subreddits.join(", ")}\n` : "";
  return `Keywords searched: ${keywords.join(", ")}
${subLine}
REDDIT DATA:
${postsText}

Extract the highest-signal audience language now.`;
}
