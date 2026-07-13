// Defensive JSON-array parsing, ported from the n8n reddit-scraper workflow's
// truncation-salvage logic (reference/prompts/reddit-scraper.md, "OUTPUT
// PARSING NOTE"). If the model's JSON array is cut off by max_tokens, we walk
// the string and recover every COMPLETE object rather than failing the whole
// call. Shared by the reddit quote extractor and the ideation synthesiser.

function stripFences(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/**
 * Walk `s` tracking brace depth (respecting strings/escapes) and collect each
 * top-level `{...}` object, JSON.parsing each one individually. A trailing,
 * truncated object is silently dropped.
 */
function salvageObjects<T>(s: string): T[] {
  const out: T[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            out.push(JSON.parse(s.slice(start, i + 1)) as T);
          } catch {
            /* skip a malformed object, keep going */
          }
          start = -1;
        }
      }
    }
  }
  return out;
}

/**
 * Parse a JSON array from a model response that may carry ```json fences and/or
 * be truncated mid-array. Tries a clean parse first, then falls back to
 * object-by-object salvage. Returns [] if nothing usable is found.
 */
export function parseJsonArrayLoose<T = unknown>(raw: string): T[] {
  const cleaned = stripFences(raw);
  const start = cleaned.indexOf("[");
  if (start === -1) return [];

  const body = cleaned.slice(start);
  const end = body.lastIndexOf("]");
  if (end !== -1) {
    try {
      const arr = JSON.parse(body.slice(0, end + 1));
      if (Array.isArray(arr)) return arr as T[];
    } catch {
      /* fall through to salvage */
    }
  }
  return salvageObjects<T>(body);
}
