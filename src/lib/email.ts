// Resend email helpers for the strategy pipeline. Node-only (no Next imports),
// so it's safe to use from server actions, route handlers, AND the Trigger.dev
// task. Env: RESEND_API_KEY, RESEND_FROM, STRATEGY_REVIEW_EMAILS (Niamh + Joe,
// comma-separated), STRATEGY_ADMIN_EMAIL (failure alerts).
import { Resend } from "resend";

const FROM = process.env.RESEND_FROM ?? "Rumi <hello@updates.fitlogicsystems.co.uk>";
const REVIEW_EMAILS = (process.env.STRATEGY_REVIEW_EMAILS ?? "joe@fitlogicsystems.co.uk")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ADMIN_EMAIL = process.env.STRATEGY_ADMIN_EMAIL ?? "joe@fitlogicsystems.co.uk";

function client(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

function shell(body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:8px 4px;color:#1a1a1a;line-height:1.55;font-size:15px">${body}</div>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="background:#0f0f0f;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${label}</a></p>`;
}

/** Draft ready → Niamh + Joe, with a deep link to review it. */
export async function sendReviewReadyEmail(opts: {
  clientName: string;
  deepLink: string;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };
  const { error } = await resend.emails.send({
    from: FROM,
    to: REVIEW_EMAILS,
    subject: `${opts.clientName}'s strategy draft is ready to review`,
    html: shell(
      `<p>${opts.clientName}'s strategy draft has been generated and is ready to review.</p>
       <p>Open it, make any edits, then hit <strong>Release now</strong> to send it to them. If you do nothing, it releases automatically after the review window.</p>
       ${button(opts.deepLink, "Review the strategy")}`
    ),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Released → the client. Warm, no automation language. */
export async function sendStrategyReleasedEmail(opts: {
  to: string;
  clientName: string;
  link: string;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };
  const first = opts.clientName.split(" ")[0] || "there";
  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject: "Niamh has finished building your strategy",
    html: shell(
      `<p>Hi ${first},</p>
       <p>Niamh has finished building your personal brand strategy. It's ready and waiting for you inside Rumi.</p>
       <p>Take your time with it, read it in full without distractions, and start with the first action in section one.</p>
       ${button(opts.link, "Read your strategy")}`
    ),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Weekly check-in reminder → a client who hasn't checked in this week.
 * `first` (Monday) is a warm nudge; `second` (Thursday) is a gentler follow-up.
 * From-Niamh tone, short, links straight to /check-in. Copy approved 2026-07-11.
 */
export async function sendCheckinReminderEmail(opts: {
  to: string;
  clientName: string;
  stage: "first" | "second";
  link: string;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };
  const first = opts.clientName.split(" ")[0] || "there";

  const subject =
    opts.stage === "first"
      ? "Your weekly check-in is open"
      : "Still got 5 minutes for your check-in?";

  const body =
    opts.stage === "first"
      ? `<p>Hi ${first},</p>
         <p>New week, so your check-in is open. It takes about five minutes and it's the thing that lets me actually see how your week went, the numbers, the content, and how you're really doing.</p>
         <p>Do it while it's fresh and I'll have your read waiting.</p>
         ${button(opts.link, "Do this week's check-in")}
         <p style="color:#6b655c;font-size:13px">If you've already done it, ignore this.</p>`
      : `<p>Hi ${first},</p>
         <p>Just a gentle nudge, your check-in for this week is still open. No stress if it's been a busy one, that's usually exactly the week worth logging.</p>
         <p>Five minutes and you're done.</p>
         ${button(opts.link, "Do this week's check-in")}
         <p style="color:#6b655c;font-size:13px">If you've already done it, ignore this.</p>`;

  const { error } = await resend.emails.send({
    from: FROM,
    to: opts.to,
    subject,
    html: shell(body),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Generation failed → Joe, with the error. */
export async function sendGenerationFailedEmail(opts: {
  clientName: string;
  error: string;
}): Promise<{ ok: boolean; error?: string }> {
  const resend = client();
  if (!resend) return { ok: false, error: "RESEND_API_KEY not set" };
  const { error } = await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `Strategy generation FAILED for ${opts.clientName}`,
    html: shell(
      `<p>Strategy generation failed for <strong>${opts.clientName}</strong>.</p>
       <pre style="white-space:pre-wrap;background:#f6f2ea;border-radius:8px;padding:12px;font-size:13px">${opts.error}</pre>
       <p>The strategy row is marked <code>failed</code>. Use Regenerate from the client's strategy page to retry.</p>`
    ),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
