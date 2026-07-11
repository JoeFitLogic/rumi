// Weekly Check-In — single source of truth for the questions, their exact
// wording, order, grouping, and how each maps to a checkin_responses column.
// Drives BOTH the multi-step form and the results week-browser, so wording can
// never drift between input and display.
//
// ⚠️ The wording below is verbatim per spec. Do NOT soften or reword any
// question (the mindset question especially).

export type SectionName = "Business Health" | "Content" | "Mindset" | "Feedback";

export const SECTIONS: SectionName[] = [
  "Business Health",
  "Content",
  "Mindset",
  "Feedback",
];

export type FieldKind = "int" | "money" | "slider" | "text" | "longtext" | "multiselect";

export interface CheckinField {
  column: string;
  label: string;
  section: SectionName;
  kind: FieldKind;
  /** calls_attended also carries a free-text "why" → calls_attended_note. */
  note?: boolean;
}

// "Where are you most stuck right now?" — the eight fixed options.
export const STUCK_OPTIONS: string[] = [
  "Knowing what to post",
  "Getting content made consistently",
  "Converting followers into leads",
  "DM conversations",
  "Discovery calls",
  "Knowing what is actually working",
  "Time and capacity",
  "Confidence on camera",
];

export const FIELDS: CheckinField[] = [
  // ── Business Health ──
  { column: "calls_attended", label: "How many calls did you attend last week? If none, why?", section: "Business Health", kind: "int", note: true },
  { column: "calls_offered", label: "Calls Offered", section: "Business Health", kind: "int" },
  { column: "calls_booked", label: "Calls Booked", section: "Business Health", kind: "int" },
  { column: "calls_taken", label: "Calls Taken", section: "Business Health", kind: "int" },
  { column: "sales_made", label: "Sales Made", section: "Business Health", kind: "int" },
  { column: "cash_collected", label: "Cash Collected", section: "Business Health", kind: "money" },
  { column: "cash_contracted", label: "Cash Contracted", section: "Business Health", kind: "money" },
  { column: "month_revenue", label: "Month Revenue", section: "Business Health", kind: "money" },
  { column: "followers_gained", label: "Followers Gained", section: "Business Health", kind: "int" },
  { column: "content_volume", label: "Volume of Content Posted", section: "Business Health", kind: "int" },
  { column: "story_sequences", label: "How many story sequences did you run this week?", section: "Business Health", kind: "int" },
  { column: "dm_confidence", label: "How would you rate your DM confidence this week (1-10)", section: "Business Health", kind: "slider" },
  // ── Content ──
  { column: "content_satisfaction", label: "How satisfied are you with your content this week? (1-10)", section: "Content", kind: "slider" },
  { column: "content_win", label: "One piece of content that performed better than expected. Topic, format, why it worked.", section: "Content", kind: "longtext" },
  { column: "audience_topic", label: "What's one thing your audience or clients didn't shut up about this week?", section: "Content", kind: "longtext" },
  { column: "client_transcripts", label: "Share client transcripts here (if applicable)", section: "Content", kind: "longtext" },
  { column: "contrarian_observation", label: "What's something you saw or heard this week that made you think 'that's wrong' or 'more people need to know this'?", section: "Content", kind: "longtext" },
  { column: "client_lesson", label: "What's something you worked through with a client this week that others in your position would find useful?", section: "Content", kind: "longtext" },
  // ── Mindset ──
  { column: "mindset_score", label: "Fuck content, fuck business, how do YOU actually feel? (1-10)", section: "Mindset", kind: "slider" },
  { column: "personal_reflection", label: "What happened in your personal life this week that reflects who you're becoming or how you're changing?", section: "Mindset", kind: "longtext" },
  { column: "biggest_win", label: "What was your biggest win this week?", section: "Mindset", kind: "longtext" },
  { column: "growth_blocker", label: "What is stopping your growth right now? Be honest.", section: "Mindset", kind: "longtext" },
  { column: "stuck_areas", label: "Where are you most stuck right now?", section: "Mindset", kind: "multiselect" },
  { column: "week_priority", label: "What is your one priority focus for the coming week?", section: "Mindset", kind: "longtext" },
  // ── Feedback ──
  { column: "feature_requests", label: "Are there any new features you'd like to see added to RUMI?", section: "Feedback", kind: "longtext" },
  { column: "support_needed", label: "What more do you need from us this week?", section: "Feedback", kind: "longtext" },
  { column: "mentor_feedback", label: "Is there anything we can improve in how I'm mentoring you?", section: "Feedback", kind: "longtext" },
];

export function fieldsFor(section: SectionName): CheckinField[] {
  return FIELDS.filter((f) => f.section === section);
}

// The full DB row shape (every checkin_responses column the app touches).
export interface CheckinRow {
  id: string;
  user_id: string;
  week_starting: string;
  calls_attended: number | null;
  calls_attended_note: string | null;
  calls_offered: number | null;
  calls_booked: number | null;
  calls_taken: number | null;
  sales_made: number | null;
  cash_collected: number | null;
  cash_contracted: number | null;
  month_revenue: number | null;
  followers_gained: number | null;
  content_volume: number | null;
  story_sequences: number | null;
  dm_confidence: number | null;
  content_satisfaction: number | null;
  content_win: string | null;
  audience_topic: string | null;
  client_transcripts: string | null;
  contrarian_observation: string | null;
  client_lesson: string | null;
  mindset_score: number | null;
  personal_reflection: string | null;
  biggest_win: string | null;
  growth_blocker: string | null;
  stuck_areas: string[] | null;
  week_priority: string | null;
  feature_requests: string | null;
  support_needed: string | null;
  mentor_feedback: string | null;
  created_at: string;
}

export interface CheckinAnalysisRow {
  id: string;
  user_id: string;
  week_starting: string;
  red_flags: string | null;
  plateaus: string | null;
  themes: string | null;
  recommendations: string | null;
  created_at: string;
}

// Form state is a flat map: strings for number/text inputs, number for sliders,
// string[] for the multiselect. Kept JSON-serializable for localStorage drafts.
export type FormValue = string | number | string[];
export type FormValues = Record<string, FormValue>;

export const SLIDER_DEFAULT = 5;

/** Blank form: number/text fields empty, sliders at the neutral default, [] for multiselect. */
export function emptyValues(): FormValues {
  const v: FormValues = {};
  for (const f of FIELDS) {
    if (f.kind === "slider") v[f.column] = SLIDER_DEFAULT;
    else if (f.kind === "multiselect") v[f.column] = [];
    else v[f.column] = "";
    if (f.note) v[`${f.column}_note`] = "";
  }
  return v;
}

/** Prefill form values from an existing row (for editing this week's submission). */
export function rowToValues(row: CheckinRow): FormValues {
  const v = emptyValues();
  for (const f of FIELDS) {
    const raw = (row as unknown as Record<string, unknown>)[f.column];
    if (f.kind === "slider") v[f.column] = typeof raw === "number" ? raw : SLIDER_DEFAULT;
    else if (f.kind === "multiselect") v[f.column] = Array.isArray(raw) ? (raw as string[]) : [];
    else v[f.column] = raw === null || raw === undefined ? "" : String(raw);
    if (f.note) {
      const n = (row as unknown as Record<string, unknown>)[`${f.column}_note`];
      v[`${f.column}_note`] = n === null || n === undefined ? "" : String(n);
    }
  }
  return v;
}

/**
 * Coerce raw form values into a checkin_responses payload (DB column → value).
 * Numbers: empty → null. Sliders: clamped 1-10. Text: trimmed, empty → null.
 * Multiselect: filtered to known options, empty → null. Used by the server action.
 */
export function toPayload(values: FormValues): Record<string, number | string | string[] | null> {
  const out: Record<string, number | string | string[] | null> = {};
  const num = (raw: FormValue): number | null => {
    const n = typeof raw === "number" ? raw : parseFloat(String(raw).trim());
    return Number.isFinite(n) ? n : null;
  };
  const txt = (raw: FormValue): string | null => {
    const s = String(raw ?? "").trim();
    return s.length > 0 ? s : null;
  };
  for (const f of FIELDS) {
    const raw = values[f.column];
    if (f.kind === "int") {
      const n = num(raw);
      out[f.column] = n === null ? null : Math.round(n);
    } else if (f.kind === "money") {
      out[f.column] = num(raw);
    } else if (f.kind === "slider") {
      const n = num(raw);
      out[f.column] = n === null ? null : Math.min(10, Math.max(1, Math.round(n)));
    } else if (f.kind === "multiselect") {
      const arr = Array.isArray(raw) ? raw.filter((x) => STUCK_OPTIONS.includes(x)) : [];
      out[f.column] = arr.length > 0 ? arr : null;
    } else {
      out[f.column] = txt(raw);
    }
    if (f.note) out[`${f.column}_note`] = txt(values[`${f.column}_note`]);
  }
  return out;
}

/** This week's Monday as YYYY-MM-DD, in local time (matches Postgres date_trunc('week')). */
export function mondayOf(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = (d.getDay() + 6) % 7; // days since Monday (Mon=0 … Sun=6)
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

/** e.g. "Week of 6 Jul 2026" from a YYYY-MM-DD week_starting. */
export function weekLabel(weekStarting: string): string {
  const [y, m, d] = weekStarting.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
