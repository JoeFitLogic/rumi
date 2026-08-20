import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getActiveClient } from "@/lib/activeClient";
import { loadSocialData } from "@/lib/social";
import ConnectInstagramCard from "@/components/social/ConnectInstagramCard";
import SocialMetricStrip from "@/components/social/SocialMetricStrip";
import EngagementChart from "@/components/social/EngagementChart";
import TopContent from "@/components/social/TopContent";

/**
 * Social analytics — the client's own Instagram performance.
 *
 * LAYOUT SHELL: Instagram isn't connected, so loadSocialData() returns the
 * empty shape and every section renders its own empty state. See the seam
 * comment at the top of src/lib/social.ts for where the real data connects.
 *
 * Section order mirrors the reference dashboard: header + window label →
 * metric strip → engagement over time → top performing content, with the
 * connect CTA promoted to the top while the integration is pending.
 */
export default async function SocialPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const asParam = typeof params.as === "string" ? params.as : null;

  // Resolved through getActiveClient() so the admin switcher works here too.
  const ctx = await getActiveClient(asParam);
  if (!ctx) redirect("/login");

  const now = new Date();
  const social = await loadSocialData(ctx.activeClientId, now);

  const firstName = (ctx.activeClient.name ?? "there").split(" ")[0];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <PageHeader
          eyebrow="Social"
          title={`${firstName}'s Instagram`}
          description="Your reach, engagement and best-performing posts, pulled straight from Instagram."
        />
        <div className="mb-8 shrink-0 text-xs text-ink-soft">
          {social.handle ? (
            <span className="font-medium text-ink">@{social.handle}</span>
          ) : null}
          <span className={social.handle ? "ml-2" : undefined}>
            {social.windowLabel}
          </span>
        </div>
      </div>

      {!social.connected && <ConnectInstagramCard />}

      <SocialMetricStrip metrics={social.metrics} connected={social.connected} />

      <section className="card mb-6">
        <p className="eyebrow mb-4">Engagement over time</p>
        <EngagementChart points={social.engagement} />
      </section>

      <section className="card">
        <p className="eyebrow mb-4">Top performing content</p>
        <TopContent rows={social.topContent} />
      </section>
    </div>
  );
}
