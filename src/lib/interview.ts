import { stripPunctuationDashes } from "@/lib/prose";

// Interview mode — shared vocabulary and the pure helpers.
//
// Deliberately NOT in interviewActions.ts: that file is "use server", where
// every export has to be an async server action, and the chat component needs
// these synchronously in the browser to render a reply.

export interface InterviewMessage {
  role: "user" | "assistant";
  content: string;
}

/** The synthetic first turn. The Messages API requires the thread to open on a
 *  user message, and the interview opens with Rumi asking the story type. */
export const INTERVIEW_OPENER =
  "Start the interview. Ask me which story type I'm working on, and nothing else yet.";

export const SCRIPT_OPEN = "===SCRIPT===";
export const SCRIPT_CLOSE = "===END SCRIPT===";

/**
 * Pull the finished script out of a reply.
 *
 * The prompt asks for the script between two markers. Markers rather than JSON
 * on purpose: the strategy task already showed this model dropping a closing
 * bracket often enough to burn a retry, and a mangled marker should cost one
 * save, not the whole turn.
 *
 * A reply with an opening marker and no closing one still yields a script (take
 * the rest of the message). A truncated close is the likeliest malformation, and
 * throwing a finished script away over punctuation would be the wrong trade —
 * `markersMissing` lets the UI say so instead.
 */
export function extractScript(reply: string): {
  script: string | null;
  markersMissing: boolean;
} {
  const start = reply.indexOf(SCRIPT_OPEN);
  if (start === -1) return { script: null, markersMissing: false };
  const from = start + SCRIPT_OPEN.length;
  const end = reply.indexOf(SCRIPT_CLOSE, from);
  const raw = (end === -1 ? reply.slice(from) : reply.slice(from, end)).trim();
  if (!raw) return { script: null, markersMissing: true };
  return { script: stripPunctuationDashes(raw), markersMissing: end === -1 };
}

/** Everything except the script block — what the thread shows above the draft. */
export function replyWithoutScript(reply: string): string {
  const start = reply.indexOf(SCRIPT_OPEN);
  if (start === -1) return reply.trim();
  const end = reply.indexOf(SCRIPT_CLOSE, start);
  const tail = end === -1 ? "" : reply.slice(end + SCRIPT_CLOSE.length);
  return (reply.slice(0, start) + tail).trim();
}

/**
 * The IMF block, if the model has stated it. Saved alongside the script so the
 * library row carries what the script was aiming at.
 */
export function extractImf(reply: string): string {
  const above = replyWithoutScript(reply);
  const i = above.search(/\*{0,2}IDEA\b/i);
  if (i === -1) return "";
  return above.slice(i).trim();
}

/**
 * A library title for the finished script: the IMF's Idea line if there is one,
 * else the script's own opening line. Never invented.
 */
export function deriveTopic(reply: string, script: string): string {
  const imf = extractImf(reply);
  const idea = imf.match(/\*{0,2}IDEA:?\*{0,2}\s*(.+)/i)?.[1]?.trim();
  if (idea) return idea.replace(/\*+/g, "").trim();
  const firstLine = script.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return firstLine.slice(0, 200);
}

/** The 20 story types, for the picker chips. Labels match the spec exactly. */
export const STORY_TYPES: string[] = [
  "01 THE WIN",
  "02 THE LOSS",
  "03 THE STRUGGLE",
  "04 THE CLIENT STORY",
  "05 THE FRESH LESSON",
  "06 THE WEEK",
  "07 THE TURNING POINT",
  "08 THE MISTAKE",
  "09 THE CONTRARIAN BELIEF",
  "10 THE CONVERSATION",
  "11 THE THING THEY HATE",
  "12 THE DOUBT MOMENT",
  "13 THE THING THEY WISH THEY'D KNOWN",
  "14 THE ORIGIN",
  "15 THE PROCESS",
  "16 THE NUMBER",
  "17 THE DIFFERENCE",
  "18 THE FEAR THEY FACED",
  "19 THE REFRAME",
  "20 THE PHRASE",
];

/** Which story type the conversation settled on, read back off the thread. */
export function detectStoryType(messages: InterviewMessage[]): string {
  for (const m of messages) {
    const upper = m.content.toUpperCase();
    for (const t of STORY_TYPES) {
      const name = t.slice(3); // drop the "01 " prefix
      if (upper.includes(name) || upper.includes(t)) return t;
    }
  }
  return "";
}
