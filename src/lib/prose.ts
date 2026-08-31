// Output hygiene for anything Rumi writes that a client will read as a script.
//
// These are guarantees, not requests. Every generation prompt in the repo bans
// em dashes and ends with a final pass telling the model to scan the text
// character by character for them, which is the strongest wording we have, and
// it still is not enough: a verification run of Interview mode produced a good
// script with two em dashes in it, which is the exact AI-tell Niamh sends
// scripts back for. So the prompt asks and this enforces.

/**
 * Em and en dashes used as punctuation, replaced with a comma.
 *
 * Applied to every script-producing path: the form flow's script and its
 * refinements, the ten hooks, and the interview's finished script.
 *
 * Two things are deliberately left alone:
 *   * Numeric ranges (45-60) keep their dash. That reads as a range, not as an
 *     AI tell, and a comma would change the meaning.
 *   * A dash opening a line, which is a list marker rather than punctuation.
 *
 * NOT applied to the app's own UI copy or to Rumi's chat messages during an
 * interview. The no-em-dash rule is a SCRIPT rule, and the chrome already uses
 * them (see the note in script-studio/page.tsx).
 */
export function stripPunctuationDashes(text: string): string {
  return text
    .replace(/[^\S\n]*[—–][^\S\n]*/g, (match, offset: number, whole: string) => {
      const before = whole.slice(0, offset).slice(-1);
      const after = whole.slice(offset + match.length).slice(0, 1);
      if (/\d/.test(before) && /\d/.test(after)) return match;
      if (before === "" || before === "\n") return match;
      return ", ";
    })
    // Tidy what the substitution can leave behind.
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/,\s*([.!?])/g, "$1");
}
