"use server";

import { FORM_COLUMNS } from "@/lib/onboarding";
import { onboardingKeyMatches } from "@/lib/onboardingKey";
import { submitOnboarding } from "@/lib/submitOnboarding";

// Server action behind the public /onboarding form.
//
// This is a PUBLIC endpoint — there is no session behind it — so it re-checks
// the URL key itself. The page's own key check gates rendering; it does not
// gate this action, and an action must never trust that the caller came from a
// page it rendered.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Longest single answer we will store. Generous — these are essay answers —
 *  but bounded, so a public endpoint can't be used to push arbitrary volume
 *  into a Cleo-shared table. */
const MAX_ANSWER_CHARS = 20_000;
const MAX_NAME_CHARS = 200;

export type SubmitState =
  | { status: "ok"; deduped: boolean; inviteSent: boolean }
  | { status: "error"; message: string };

export async function submitOnboardingForm(input: {
  key: string;
  name: string;
  email: string;
  answers: Record<string, string>;
}): Promise<SubmitState> {
  if (!onboardingKeyMatches(input.key)) {
    return { status: "error", message: "This link is no longer valid." };
  }

  const name = String(input.name ?? "").trim().slice(0, MAX_NAME_CHARS);
  const email = String(input.email ?? "").trim().toLowerCase();

  if (!name) {
    return { status: "error", message: "Please add your full name." };
  }
  if (!EMAIL_RE.test(email)) {
    return { status: "error", message: "Please add a valid email address." };
  }

  // NEVER trust the browser to name columns. The answers object is keyed by
  // column name, so without this allowlist a caller could set user_id, status,
  // or any other column on a Cleo-shared table. Only columns the form itself
  // owns get through; anything else is dropped silently.
  const allowed = new Set(FORM_COLUMNS);
  const responses: Record<string, string | null> = {};
  for (const [column, value] of Object.entries(input.answers ?? {})) {
    if (!allowed.has(column)) continue;
    const trimmed = String(value ?? "").trim().slice(0, MAX_ANSWER_CHARS);
    responses[column] = trimmed.length > 0 ? trimmed : null;
  }

  try {
    const result = await submitOnboarding({
      email,
      name,
      responses,
      source: "native",
    });
    // inviteSent is surfaced so the confirmation screen doesn't tell the client
    // to check an inbox for a mail that failed to send. The submission itself is
    // safe either way -- their answers are stored and Joe can re-invite.
    return {
      status: "ok",
      deduped: result.deduped,
      inviteSent: result.inviteSent,
    };
  } catch (err) {
    // Don't leak internals to a public page.
    console.error("[onboarding] submit failed", err);
    return {
      status: "error",
      message:
        "Something went wrong saving your answers. Your answers are still saved in this browser — please try again in a moment.",
    };
  }
}
