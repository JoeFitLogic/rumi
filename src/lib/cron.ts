/**
 * Shared CRON_SECRET bearer check for Vercel cron routes. Vercel injects
 * `Authorization: Bearer $CRON_SECRET` on scheduled invocations; we also accept
 * `?secret=` for manual curl testing. Returns false if CRON_SECRET is unset.
 */
export function cronAuthorized(request: Request): boolean {
  const auth = request.headers.get("authorization");
  const url = new URL(request.url);
  const secret = process.env.CRON_SECRET;
  return (
    !!secret &&
    (auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret)
  );
}
