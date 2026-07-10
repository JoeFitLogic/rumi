import { redirect } from "next/navigation";
import { ClipboardList, Sparkles } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getActiveClient } from "@/lib/activeClient";
import { createClient } from "@/lib/supabase/server";
import StrategyDisplay, {
  type StrategySectionRow,
} from "./StrategyDisplay";
import StrategyReview from "./StrategyReview";
import RegenerateButton from "./RegenerateButton";

interface StrategyRow {
  id: string;
  status: string;
  released_at: string | null;
  review_deadline: string | null;
  completed_at: string | null;
  client_name: string | null;
  onboarding_id: string | null;
}

export default async function StrategyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const asParam = typeof params.as === "string" ? params.as : null;

  const ctx = await getActiveClient(asParam);
  if (!ctx) redirect("/login");

  const isPrivileged = ctx.viewer.role === "admin";
  const firstName = (ctx.activeClient.name ?? "there").split(" ")[0];
  const supabase = await createClient();

  const [{ data: onboarding }, { data: strategyRow }] = await Promise.all([
    supabase
      .from("onboarding_responses")
      .select("id, status")
      .eq("user_id", ctx.activeClientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("strategies")
      .select(
        "id, status, released_at, review_deadline, completed_at, client_name, onboarding_id"
      )
      .eq("user_id", ctx.activeClientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const strategy = strategyRow as StrategyRow | null;

  // ── Guard rail: no onboarding submitted → onboarding comes first ────────
  if (!onboarding) {
    return (
      <Shell>
        {isPrivileged ? (
          <Info
            title={`${firstName} hasn't completed onboarding yet`}
            body="Their strategy is built from their onboarding answers. Once they submit the onboarding form, generation kicks off automatically and the draft will appear here for you to review."
          />
        ) : (
          <Info
            icon={<ClipboardList size={18} strokeWidth={1.75} />}
            title="Your strategy starts with onboarding"
            body="Before Niamh can build your personal brand strategy, she needs to hear about you, your audience, and your goals. Complete your onboarding and she'll take it from there."
          />
        )}
      </Shell>
    );
  }

  const released = !!strategy?.released_at;
  const complete = strategy?.status === "complete";

  // ── Released → full 12-section display for everyone ─────────────────────
  if (strategy && released) {
    const sections = await loadSections(supabase, strategy.id);
    return (
      <Shell wide>
        {isPrivileged && (
          <p className="mb-6 text-xs text-ink-soft">
            Released to {firstName}
            {strategy.released_at
              ? ` on ${new Date(strategy.released_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}`
              : ""}
            .
          </p>
        )}
        <StrategyDisplay sections={sections} />
      </Shell>
    );
  }

  // ── Admin, complete but unreleased → review + edit + release ────────────
  if (strategy && isPrivileged && complete) {
    const sections = await loadSections(supabase, strategy.id);
    return (
      <Shell wide>
        <StrategyReview
          sections={sections}
          strategyId={strategy.id}
          reviewDeadline={strategy.review_deadline}
          clientName={firstName}
        />
      </Shell>
    );
  }

  // ── Admin, failed → error + regenerate ──────────────────────────────────
  if (strategy && isPrivileged && strategy.status === "failed") {
    return (
      <Shell>
        <div className="card">
          <p className="eyebrow mb-2 text-gold-deep">Generation failed</p>
          <p className="max-w-lg text-sm text-ink-soft">
            {firstName}&apos;s strategy generation didn&apos;t complete. You were
            emailed the error. Regenerate to try again.
          </p>
          <div className="mt-4">
            <RegenerateButton strategyId={strategy.id} />
          </div>
        </div>
      </Shell>
    );
  }

  // ── Admin, still generating/pending → status note ───────────────────────
  if (strategy && isPrivileged) {
    return (
      <Shell>
        <Info
          icon={<Sparkles size={18} strokeWidth={1.75} />}
          title={`${firstName}'s strategy is generating`}
          body="Both parts are being written in parallel. This usually takes a few minutes. You'll get an email the moment the draft is ready to review, or refresh this page."
        />
      </Shell>
    );
  }

  // ── Client, any not-yet-released state → warm building state ─────────────
  return (
    <Shell>
      <div className="card border-gold/30 bg-gold-tint/30">
        <p className="eyebrow mb-2">In progress</p>
        <h2 className="font-display text-2xl text-ink">
          Niamh is building your strategy
        </h2>
        <p className="mt-3 max-w-md text-sm text-ink-soft">
          She&apos;s putting together your personal brand and growth strategy
          from your onboarding answers. It&apos;ll land here the moment it&apos;s
          ready, and you&apos;ll get an email to let you know.
        </p>
      </div>
    </Shell>
  );
}

async function loadSections(
  supabase: Awaited<ReturnType<typeof createClient>>,
  strategyId: string
): Promise<StrategySectionRow[]> {
  const { data } = await supabase
    .from("strategy_sections")
    .select("id, section_number, section_title, content")
    .eq("strategy_id", strategyId)
    .order("section_number", { ascending: true });
  return (data ?? []) as StrategySectionRow[];
}

function Shell({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div>
      <PageHeader
        eyebrow="My Strategy"
        title="Your content strategy"
        description={
          wide
            ? undefined
            : "Your 12-section personal brand strategy, built from your onboarding answers."
        }
      />
      {children}
    </div>
  );
}

function Info({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="card">
      {icon && (
        <span className="mb-3 inline-flex size-9 items-center justify-center rounded-full bg-gold-tint text-gold-deep">
          {icon}
        </span>
      )}
      <h2 className="font-display text-xl text-ink">{title}</h2>
      <p className="mt-2 max-w-lg text-sm text-ink-soft">{body}</p>
    </div>
  );
}
