// Script Studio — shared vocabulary + row shape.
//
// Values below MUST match what already lives in the shared `scripts` table
// (Cleo wrote 1500+ rows), so the generator's saves and the legacy library
// speak the same language and existing filters work:
//   content_type: talking_head | storytelling | carousel | broll_text | screen_record | clone
//   pillar:       personal | proof | perspective
//   audience_stage: discovery | familiarity | trust | conversion
//   hook_type:    mistake | contrarian | specific_audience | result | bold_claim | open_loop
// These are stored lowercase; the labels below are display-only.

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

// Content formats, each with a one-line plain-language description.
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
    description: "Voiceover over background footage with bold text on screen.",
  },
  {
    value: "screen_record",
    label: "Screen recording",
    description: "You record your screen and narrate. Show the thing, explain it.",
  },
  {
    value: "clone",
    label: "Green screen / react",
    description: "React to a post, comment or video pinned beside you.",
  },
];

export const HOOK_TYPES: Option[] = [
  { value: "mistake", label: "Common mistake" },
  { value: "contrarian", label: "Contrarian take" },
  { value: "specific_audience", label: "Call out a specific audience" },
  { value: "result", label: "Result / outcome" },
  { value: "bold_claim", label: "Bold claim" },
  { value: "open_loop", label: "Open loop / curiosity" },
];

export const PILLARS: Option[] = [
  { value: "personal", label: "Personal" },
  { value: "proof", label: "Proof" },
  { value: "perspective", label: "Perspective" },
];

export const AUDIENCE_STAGES: Option[] = [
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
