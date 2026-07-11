import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { getActiveClient } from "@/lib/activeClient";
import { createClient } from "@/lib/supabase/server";
import { groupedOnboarding } from "@/lib/onboarding";
import {
  ProfilePanel,
  SecurityPanel,
  IntegrationsPanel,
} from "./SettingsPanels";

export default async function SettingsPage() {
  // Settings is always the signed-in user's OWN account — never impersonated.
  const ctx = await getActiveClient();
  if (!ctx) redirect("/login");
  const { viewer } = ctx;

  // Clients see a read-only view of their onboarding answers.
  let answers: Record<string, unknown> | null = null;
  if (viewer.role === "client") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("onboarding_responses")
      .select("*")
      .eq("user_id", viewer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    answers = data ?? null;
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        eyebrow="Settings"
        title="Your account"
        description="Manage your profile, password, and connected tools."
      />

      <div className="space-y-6">
        <ProfilePanel initialName={viewer.name ?? ""} email={viewer.email} />
        <SecurityPanel email={viewer.email} />
        <IntegrationsPanel />

        {viewer.role === "client" && <MyAnswers answers={answers} />}
      </div>
    </div>
  );
}

// Read-only "My answers" — clients don't self-edit; those answers feed strategy
// and script generation, so changes go through Niamh.
function MyAnswers({ answers }: { answers: Record<string, unknown> | null }) {
  const groups = groupedOnboarding(answers);
  const hasAny = groups.some((g) => g.fields.some((f) => f.value.trim().length > 0));

  return (
    <section className="card">
      <h2 className="font-display text-lg text-ink">My answers</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Your onboarding answers. These shape your strategy and scripts — to change
        anything, message Niamh and she&apos;ll update them for you.
      </p>

      {!hasAny ? (
        <p className="mt-5 rounded-lg border border-line bg-cream/50 px-4 py-6 text-center text-sm text-ink-soft">
          You haven&apos;t completed onboarding yet. Your answers will appear here once you do.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map((group) => {
            const answered = group.fields.filter((f) => f.value.trim().length > 0);
            if (answered.length === 0) return null;
            return (
              <div key={group.group}>
                <p className="eyebrow mb-2.5">{group.group}</p>
                <dl className="space-y-3">
                  {answered.map((f) => (
                    <div key={f.column}>
                      <dt className="text-xs font-medium text-ink-soft">{f.label}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-ink">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
