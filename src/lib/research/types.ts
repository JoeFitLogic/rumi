// Shared shapes for the /research 5-step flow.

/** A card extracted from a call transcript (Step 2). */
export interface TranscriptCard {
  id: string;
  category: "pain_point" | "recurring_phrase" | "limiting_belief";
  text: string;
  context: string;
}

/** A quote extracted from Reddit posts/comments (Step 3). */
export interface RedditQuote {
  id: string;
  text: string;
  subreddit: string;
  upvotes: number;
  type: "pain_point" | "question" | "belief" | "frustration" | "desire" | string;
  context: string;
  postTitle: string;
}

/** A generated content idea (Step 4). Mirrors the content_ideas columns. */
export interface ContentIdea {
  title: string;
  hook: string;
  pillar: string;
  format: string;
  source: string;
  angle: string;
}

/** The four research-note buffers persisted per client in localStorage. */
export interface ResearchNotes {
  analytics: string;
  clients: string;
  forums: string;
  trends: string;
}

export const EMPTY_NOTES: ResearchNotes = {
  analytics: "",
  clients: "",
  forums: "",
  trends: "",
};
