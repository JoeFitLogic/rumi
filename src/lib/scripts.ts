// Script Studio — shared vocabulary + row shape.
//
// Values below MUST match what already lives in the shared `scripts` table
// (Cleo wrote 1900+ rows), so the generator's saves and the legacy library
// speak the same language and existing filters work:
//   content_type: talking_head | storytelling | carousel | broll_text | screen_record | clone
//   pillar:       connect | nurture | convert   (new)  ·  personal | proof | perspective (legacy)
//   audience_stage: discovery | familiarity | trust | conversion   (legacy)
//   hook_type:    mistake | contrarian | specific_audience | result | bold_claim | open_loop (legacy)
// These are stored lowercase; the labels below are display-only.
//
// LEGACY vs OFFERED (Session 6, client feedback):
//   The picker now offers a SUBSET. "screen_record" and "clone" were dropped as
//   content types, and the hook-type + audience-stage selectors were removed
//   entirely (the client picks a written hook instead — see generateHooks).
//   The pillar model moved to Connect / Nurture / Convert to match the strategy
//   doc's Content Model. The old values are NOT rewritten in the DB: the *_ALL
//   lists below exist purely so the library can still label and filter the 1900
//   rows that carry them. Never offer a LEGACY_* list in a form.

export interface ScriptRow {
  id: string;
  user_id: string;
  topic: string | null;
  content_type: string | null;
  hook_type: string | null;
  pillar: string | null;
  audience_stage: string | null;
  length: string | null;
  additional_context: string | null;
  generated_script: string | null;
  status: string | null;
  created_at: string;
  // Present only once migration 0009 has run; tolerated as optional so the app
  // works before/after the migration.
  updated_at?: string | null;
}

export interface Option {
  value: string;
  label: string;
  /** Plain-language, one line — shown so clients understand the format. */
  description?: string;
}

// Content formats offered in the picker, each with a one-line description.
export const CONTENT_TYPES: Option[] = [
  {
    value: "talking_head",
    label: "Talking head",
    description: "Just you, speaking straight to camera. No frills.",
  },
  {
    value: "storytelling",
    label: "Storytelling",
    description: "A personal story told to camera, with a beginning, middle and turn.",
  },
  {
    value: "carousel",
    label: "Carousel",
    description: "Swipeable slides of text. Silent, made to be read not spoken.",
  },
  {
    value: "broll_text",
    label: "B-roll + text",
    description: "Voiceover over background footage.",
  },
];

/** Retired formats. Label + filter only, never offered in the picker. */
export const LEGACY_CONTENT_TYPES: Option[] = [
  { value: "screen_record", label: "Screen recording" },
  { value: "clone", label: "Green screen / react" },
];

export const ALL_CONTENT_TYPES: Option[] = [...CONTENT_TYPES, ...LEGACY_CONTENT_TYPES];

// The Content Model from the strategy doc: three jobs a piece of content does,
// side by side. Not a funnel, not a hierarchy. Descriptions are lifted from
// STRATEGY_PART_A section 6 so the client reads the same words in both places.
export const PILLARS: Option[] = [
  {
    value: "connect",
    label: "Connect",
    description: "Reaches people who have never heard of you. Broad, low context, built to travel.",
  },
  {
    value: "nurture",
    label: "Nurture",
    description: "Builds trust with people already watching. Story, point of view, the reason they stay.",
  },
  {
    value: "convert",
    label: "Convert",
    description: "Moves someone from watching to buying. High intent, aimed at the person already close.",
  },
];

/** Retired pillar names from Cleo's rows. Label + filter only. */
export const LEGACY_PILLARS: Option[] = [
  { value: "personal", label: "Personal" },
  { value: "proof", label: "Proof" },
  { value: "perspective", label: "Perspective" },
];

export const ALL_PILLARS: Option[] = [...PILLARS, ...LEGACY_PILLARS];

/**
 * Retired selectors. The client no longer picks either — hooks are written and
 * chosen (generateHooks), and audience stage was folded into the pillar model.
 * Kept only so old rows still render a readable badge in the library.
 */
export const LEGACY_HOOK_TYPES: Option[] = [
  { value: "mistake", label: "Common mistake" },
  { value: "contrarian", label: "Contrarian take" },
  { value: "specific_audience", label: "Call out a specific audience" },
  { value: "result", label: "Result / outcome" },
  { value: "bold_claim", label: "Bold claim" },
  { value: "open_loop", label: "Open loop / curiosity" },
];

export const LEGACY_AUDIENCE_STAGES: Option[] = [
  { value: "discovery", label: "Discovery" },
  { value: "familiarity", label: "Familiarity" },
  { value: "trust", label: "Trust" },
  { value: "conversion", label: "Conversion" },
];

export const LENGTHS: Option[] = [
  { value: "30 seconds", label: "~30 seconds" },
  { value: "60 seconds", label: "~60 seconds" },
  { value: "90 seconds", label: "~90 seconds" },
];

// Lifecycle statuses, in order. Legacy Cleo rows carry status "saved" (or "" /
// null) — normalizeStatus folds those into "drafted" for display + filtering,
// without rewriting the DB until the user changes a card.
export const STATUSES: Option[] = [
  { value: "idea", label: "Idea" },
  { value: "drafted", label: "Drafted" },
  { value: "filmed", label: "Filmed" },
  { value: "published", label: "Published" },
];

const STATUS_VALUES = new Set(STATUSES.map((s) => s.value));

export function normalizeStatus(raw: string | null | undefined): string {
  if (raw && STATUS_VALUES.has(raw)) return raw;
  return "drafted";
}

export function labelFor(options: Option[], value: string | null | undefined): string {
  if (!value) return "";
  return options.find((o) => o.value === value)?.label ?? value;
}

/** How many hooks generateHooks asks for, and the most the UI will render. */
export const HOOK_COUNT = 10;
