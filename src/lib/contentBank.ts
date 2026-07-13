// Content Bank — shared vocabulary + row shape for the `content_ideas` table
// (Cleo-shared; owner column is `client_id`). Values written by the Session-7
// ideation synthesiser: pillar ∈ Personal/Proof/Perspective, format ∈
// Reel/Carousel/B-roll. Status walks idea → scripted → filmed → published.

export interface ContentIdeaRow {
  id: string;
  client_id: string | null;
  title: string;
  hook: string | null;
  pillar: string | null;
  format: string | null;
  source: string | null;
  angle: string | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface Option {
  value: string;
  label: string;
}

export const IDEA_STATUSES: Option[] = [
  { value: "idea", label: "Idea" },
  { value: "scripted", label: "Scripted" },
  { value: "filmed", label: "Filmed" },
  { value: "published", label: "Published" },
];

export const IDEA_PILLARS: Option[] = [
  { value: "Personal", label: "Personal" },
  { value: "Proof", label: "Proof" },
  { value: "Perspective", label: "Perspective" },
];

export const IDEA_FORMATS: Option[] = [
  { value: "Reel", label: "Reel" },
  { value: "Carousel", label: "Carousel" },
  { value: "B-roll", label: "B-roll" },
];

/** Map any stored status to a known one (defaults to "idea"). */
export function normalizeIdeaStatus(s: string | null | undefined): string {
  const v = (s ?? "").trim().toLowerCase();
  return IDEA_STATUSES.some((o) => o.value === v) ? v : "idea";
}

export const SELECT_IDEA =
  "id, client_id, title, hook, pillar, format, source, angle, status, notes, created_at, updated_at";
