// Onboarding field definitions — the single source of truth used by BOTH:
//   • /api/intake  → map the GHL webhook payload (keyed by form label) to
//                    onboarding_responses columns.
//   • generation   → build the grouped Q&A block that becomes Claude's user
//                    message (same grouped format the old n8n workflow used).
//
// ⚠️ LABELS ARE BEST-EFFORT pending the v2strategy workflow JSON. The exact GHL
// form labels (with their punctuation / unicode apostrophes) live in the old
// n8n insert node. Swap the `label` values below once that JSON is provided;
// nothing else needs to change. The intake mapper also accepts the raw column
// name as a key, so test payloads keyed by column work today.

export type OnboardingGroup =
  | "IDENTITY"
  | "AUDIENCE"
  | "GOALS"
  | "CONTENT RHYTHM"
  | "CONTENT"
  | "ASSETS & FUNNEL"
  | "CHALLENGES"
  | "MINDSET";

export interface OnboardingField {
  /** onboarding_responses column name */
  column: string;
  /** human question label — how it appears in the GHL form + the Q&A block */
  label: string;
  group: OnboardingGroup;
}

// Order matters: this is the order fields appear in the generated Q&A block.
export const ONBOARDING_FIELDS: OnboardingField[] = [
  // IDENTITY
  { column: "describe_yourself_3_words", label: "Describe yourself in three words", group: "IDENTITY" },
  { column: "what_makes_you_different", label: "What makes you different", group: "IDENTITY" },
  { column: "what_inspired_business", label: "What inspired you to start your business", group: "IDENTITY" },
  { column: "one_sentence_description", label: "Describe what you do in one sentence", group: "IDENTITY" },
  { column: "how_people_should_feel", label: "How do you want people to feel when they find you", group: "IDENTITY" },
  { column: "creators_brands_inspire", label: "Creators or brands that inspire you", group: "IDENTITY" },
  // AUDIENCE
  { column: "client_types", label: "The types of clients you work with", group: "AUDIENCE" },
  { column: "audience_reflects_ideal", label: "Does your current audience reflect your ideal client", group: "AUDIENCE" },
  { column: "ideal_client", label: "Describe your ideal client", group: "AUDIENCE" },
  { column: "client_struggles", label: "What your ideal client struggles with", group: "AUDIENCE" },
  { column: "client_misconceptions", label: "Misconceptions your ideal client has", group: "AUDIENCE" },
  { column: "client_goals_desires", label: "Your ideal client's goals and desires", group: "AUDIENCE" },
  // GOALS
  { column: "success_definition", label: "How you define success", group: "GOALS" },
  { column: "top_three_goals", label: "Your top three goals", group: "GOALS" },
  { column: "breakthrough_win", label: "A breakthrough win you want", group: "GOALS" },
  // CONTENT RHYTHM
  { column: "platforms", label: "Platforms you are on", group: "CONTENT RHYTHM" },
  { column: "posting_frequency", label: "How often you currently post", group: "CONTENT RHYTHM" },
  { column: "timezone", label: "Your timezone", group: "CONTENT RHYTHM" },
  // CONTENT
  { column: "content_performed_well", label: "Content that has performed well for you", group: "CONTENT" },
  { column: "content_feels_easy", label: "Content that feels easy to create", group: "CONTENT" },
  { column: "content_feels_difficult", label: "Content that feels difficult to create", group: "CONTENT" },
  { column: "existing_content_system", label: "Your existing content system", group: "CONTENT" },
  // ASSETS & FUNNEL
  { column: "products_services", label: "Your products and services", group: "ASSETS & FUNNEL" },
  { column: "how_people_find_you", label: "How people currently find you", group: "ASSETS & FUNNEL" },
  { column: "client_objections", label: "Common objections from potential clients", group: "ASSETS & FUNNEL" },
  // CHALLENGES
  { column: "biggest_challenge", label: "Your biggest challenge right now", group: "CHALLENGES" },
  { column: "content_creation_blockers", label: "What blocks you from creating content", group: "CHALLENGES" },
  { column: "skills_to_improve", label: "Skills you want to improve", group: "CHALLENGES" },
  { column: "what_didnt_work", label: "What has not worked for you before", group: "CHALLENGES" },
  // MINDSET
  { column: "most_nervous_about", label: "What you are most nervous about", group: "MINDSET" },
  { column: "understand_about_you", label: "What you want me to understand about you", group: "MINDSET" },
  { column: "anything_else", label: "Anything else you want to share", group: "MINDSET" },
];

export const GROUP_ORDER: OnboardingGroup[] = [
  "IDENTITY",
  "AUDIENCE",
  "GOALS",
  "CONTENT RHYTHM",
  "CONTENT",
  "ASSETS & FUNNEL",
  "CHALLENGES",
  "MINDSET",
];

/** Group the onboarding fields in display order, pairing each with its answer
 *  from `responses`. Used by the client "My answers" view and the admin editor. */
export function groupedOnboarding(
  responses: Record<string, unknown> | null | undefined
): { group: OnboardingGroup; fields: { column: string; label: string; value: string }[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    fields: ONBOARDING_FIELDS.filter((f) => f.group === group).map((f) => {
      const v = responses?.[f.column];
      return {
        column: f.column,
        label: f.label,
        value: v === null || v === undefined ? "" : String(v),
      };
    }),
  }));
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Map an inbound GHL webhook payload (keyed by form label OR column name) to
 * the subset of onboarding_responses columns. Unknown keys are ignored; empty
 * strings become null.
 */
export function mapIntakePayload(
  payload: Record<string, unknown>
): Record<string, string | null> {
  // Build a lookup from normalised label AND column → column.
  const lookup = new Map<string, string>();
  for (const f of ONBOARDING_FIELDS) {
    lookup.set(norm(f.label), f.column);
    lookup.set(norm(f.column), f.column);
  }

  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(payload)) {
    const col = lookup.get(norm(key));
    if (!col) continue;
    const str =
      value === null || value === undefined ? null : String(value).trim();
    out[col] = str && str.length > 0 ? str : null;
  }
  return out;
}

/**
 * Build the grouped onboarding Q&A block that becomes Claude's user message.
 * Format mirrors the old workflow: a header per group, then "Label:\nAnswer"
 * lines. Fields with no answer are skipped.
 */
export function buildOnboardingBlock(
  responses: Record<string, unknown>
): string {
  const parts: string[] = [
    "Here are the client's onboarding answers. Write their strategy from these answers up.",
    "",
  ];

  for (const group of GROUP_ORDER) {
    const fields = ONBOARDING_FIELDS.filter((f) => f.group === group);
    const answered = fields.filter((f) => {
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

  return parts.join("\n").trim();
}
