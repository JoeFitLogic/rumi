import type { Video, Step5Insights } from "./types";

// Step 5 insight derivation — pure, no AI, no network. Runs from the same
// `videos` array the Videos tab already loaded. "Hooks worth stealing / most
// common topics / most used formats", derived heuristically from each analysed
// video's `analysis` + `newConcepts` text.

// Common words to ignore when tallying topics — English filler + analysis
// meta-vocabulary (hook, concept, format…) that describes the video rather than
// its subject.
const STOP = new Set(
  ("the a an and or but of to in on for with this that these those is are was were be been being it its as at by from your you they them their our we i not no do does did so if then than too very can will just about into out up down over under more most some any each video reel content creator instagram post audience viewer people watch watching hook hooks concept concepts analysis overall format formats caption captions script scripts cta clip clips footage")
    .split(" ")
);

// Format vocabulary we can detect in the analysis prose.
const FORMAT_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Talking head", re: /talking[-\s]?head|face[-\s]?to[-\s]?camera|piece to camera/i },
  { label: "Voiceover", re: /voice[-\s]?over|voiceover|narrat/i },
  { label: "B-roll", re: /b[-\s]?roll/i },
  { label: "Text on screen", re: /text[-\s]?on[-\s]?screen|on-screen text|captions?\b/i },
  { label: "Tutorial / how-to", re: /tutorial|how[-\s]?to|step[-\s]?by[-\s]?step|walk[-\s]?through/i },
  { label: "Skit / storytelling", re: /skit|story[-\s]?tell|storytelling|narrative|scene/i },
  { label: "Green screen / react", re: /green[-\s]?screen|react(ion)?\b|duet/i },
  { label: "Listicle", re: /listicle|\b\d+ (tips|ways|reasons|things|mistakes)\b/i },
];

function extractHook(v: Video): string | null {
  const text = v.analysis ?? "";
  if (!text.trim()) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Prefer a line that names a hook, taking whatever follows the label.
  for (const line of lines) {
    const m = line.match(/hook[^:]*[:\-–]\s*(.+)/i);
    if (m && m[1] && m[1].length > 8) return clip(strip(m[1]));
  }
  // Otherwise the first substantive prose line (skip markdown headings/labels).
  for (const line of lines) {
    const s = strip(line);
    if (s.length > 24 && !/^[A-Z\s]+:?$/.test(s)) return clip(s);
  }
  return null;
}

function strip(s: string): string {
  return s.replace(/[#*`>_]/g, "").replace(/\s+/g, " ").trim();
}
function clip(s: string, n = 160): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function deriveInsights(videos: Video[]): Step5Insights {
  const analysed = videos.filter((v) => (v.analysis ?? "").trim().length > 0);

  // Hooks — from the highest-viewed analysed videos.
  const hooks: Step5Insights["hooks"] = [];
  const byViews = [...analysed].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  for (const v of byViews) {
    const text = extractHook(v);
    if (text) hooks.push({ text, creator: v.creator, views: v.views });
    if (hooks.length >= 6) break;
  }

  // Topics — word frequency across analysis + newConcepts.
  const freq = new Map<string, number>();
  for (const v of analysed) {
    const blob = `${v.analysis ?? ""} ${v.newConcepts ?? ""}`.toLowerCase();
    const words = blob.match(/[a-z][a-z'-]{3,}/g) ?? [];
    const seen = new Set<string>();
    for (const w of words) {
      if (STOP.has(w) || seen.has(w)) continue;
      seen.add(w); // count each word once per video (document frequency)
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  const topics = [...freq.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => ({ label, count }));

  // Formats — detected format keywords, tallied.
  const fmt = new Map<string, number>();
  for (const v of analysed) {
    const blob = `${v.analysis ?? ""} ${v.newConcepts ?? ""}`;
    for (const { label, re } of FORMAT_PATTERNS) {
      if (re.test(blob)) fmt.set(label, (fmt.get(label) ?? 0) + 1);
    }
  }
  const formats = [...fmt.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, count }));

  return { videoCount: analysed.length, hooks, topics, formats };
}
