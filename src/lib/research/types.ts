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

// ── Competitor research (Step 5 area) ────────────────────────────────────────
// These mirror the Cleo-shared `videos` / `creators` / `configs` tables (camelCase
// columns), plus the `client_id` added in migration 0012. `clientId === null`
// means a legacy/global (Cleo) row — visible to every client, read-only in Rumi.

export interface Video {
  id: string;
  link: string | null;
  thumbnail: string | null;
  creator: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  analysis: string | null;
  newConcepts: string | null;
  datePosted: string | null;
  configName: string | null;
  starred: boolean;
  clientId: string | null;
}

export interface Creator {
  id: string;
  username: string;
  category: string | null;
  profilePicUrl: string | null;
  followers: number | null;
  reelsCount30d: number | null;
  avgViews30d: number | null;
  lastScrapedAt: string | null;
  clientId: string | null;
}

export interface CompetitorConfig {
  id: string;
  configName: string;
  creatorsCategory: string | null;
  analysisInstruction: string | null;
  newConceptsInstruction: string | null;
  clientId: string | null;
}

/** Step 5 insights derived (client-side, no AI) from the analysed videos. */
export interface Step5Insights {
  videoCount: number;
  hooks: { text: string; creator: string | null; views: number | null }[];
  topics: { label: string; count: number }[];
  formats: { label: string; count: number }[];
}
