import "server-only";
import { timingSafeEqual } from "crypto";

/**
 * The ?k= gate on the public /onboarding form.
 *
 * Deliberately simple: this is a shareable intake link, not an authentication
 * boundary. It stops the form being found and filled in by crawlers or by
 * anyone guessing the URL; it does not identify who is filling it in. The
 * account that gets provisioned is determined by the email typed into the
 * form, exactly as the GHL form worked.
 *
 * Compared in constant time, and length is checked separately so a mismatched
 * length can't be distinguished by timing either.
 */
export function onboardingKeyMatches(provided: string | undefined | null): boolean {
  const expected = process.env.ONBOARDING_FORM_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** True when the key is configured at all. A missing env var must fail closed,
 *  not open — see the page, which renders "link not valid" rather than the
 *  form when this is false. */
export function onboardingKeyConfigured(): boolean {
  return Boolean(process.env.ONBOARDING_FORM_KEY);
}
