"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  Star,
  Trash2,
  Eye,
  Heart,
  MessageSquare,
  X,
  Loader2,
  Play,
  Users,
  Settings2,
  Lock,
  Flame,
  Hash,
  Film,
  RefreshCw,
  Plus,
} from "lucide-react";
import Markdown from "@/components/Markdown";
import { StepIntro } from "./researchUi";
import { deriveInsights } from "@/lib/research/insights";
import {
  listCompetitorCreators,
  listCompetitorConfigs,
  starVideo,
  removeVideo,
  clearVideos,
} from "./actions";
import type { Video, Creator, CompetitorConfig } from "@/lib/research/types";

type Tab = "videos" | "pipeline" | "creators" | "configs";

const TABS: { key: Tab; label: string; icon: typeof Play }[] = [
  { key: "videos", label: "Videos", icon: Film },
  { key: "pipeline", label: "Run pipeline", icon: Play },
  { key: "creators", label: "Creators", icon: Users },
  { key: "configs", label: "Configs", icon: Settings2 },
];

export default function CompetitorResearch({
  clientId,
  videos,
  selectedIds,
  onToggleSelect,
  onVideosChange,
}: {
  clientId: string;
  videos: Video[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onVideosChange: (videos: Video[]) => void;
}) {
  const [tab, setTab] = useState<Tab>("videos");
  const insights = useMemo(() => deriveInsights(videos), [videos]);

  return (
    <div className="space-y-6">
      <StepIntro
        eyebrow="Step 5 · Competitor research & hooks"
        title="Steal what's already working"
        description="Study the reels landing in your niche, then let the hooks, topics and formats sharpen your own ideas. Select videos here to feed them into ideation."
      />

      <Insights insights={insights} />

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3.5 py-2 text-sm transition-colors ${
                isActive
                  ? "border-gold bg-gold-tint/40 font-medium text-ink"
                  : "border-line bg-paper text-ink-soft hover:border-gold/50"
              }`}
            >
              <Icon size={15} strokeWidth={1.75} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "videos" && (
        <VideosTab
          clientId={clientId}
          videos={videos}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onVideosChange={onVideosChange}
        />
      )}
      {tab === "pipeline" && <PipelineStub />}
      {tab === "creators" && <CreatorsTab clientId={clientId} />}
      {tab === "configs" && <ConfigsTab clientId={clientId} />}
    </div>
  );
}

// ── Derived insights (hooks / topics / formats) ──────────────────────────────
function Insights({ insights }: { insights: ReturnType<typeof deriveInsights> }) {
  if (insights.videoCount === 0) {
    return (
      <div className="card border-dashed bg-cream/40 py-8 text-center text-sm text-ink-soft">
        Insights appear once there are analysed competitor videos below.
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card">
        <h3 className="flex items-center gap-2 font-display text-base text-ink">
          <Flame size={16} strokeWidth={1.75} className="text-gold" /> Hooks worth stealing
        </h3>
        {insights.hooks.length === 0 ? (
          <p className="mt-3 text-xs text-ink-soft">No clear hooks detected yet.</p>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {insights.hooks.map((h, i) => (
              <li key={i} className="border-l-2 border-gold pl-3 text-sm text-ink">
                &ldquo;{h.text}&rdquo;
                {h.creator && (
                  <span className="mt-0.5 block text-[11px] text-ink-soft">
                    @{h.creator}
                    {typeof h.views === "number" ? ` · ${fmt(h.views)} views` : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="flex items-center gap-2 font-display text-base text-ink">
          <Hash size={16} strokeWidth={1.75} className="text-gold" /> Most common topics
        </h3>
        {insights.topics.length === 0 ? (
          <p className="mt-3 text-xs text-ink-soft">Not enough analysed videos yet.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {insights.topics.map((t) => (
              <span
                key={t.label}
                className="rounded-full bg-cream px-2.5 py-1 text-xs text-ink"
              >
                {t.label} <span className="text-ink-soft">×{t.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="flex items-center gap-2 font-display text-base text-ink">
          <Film size={16} strokeWidth={1.75} className="text-gold" /> Most used formats
        </h3>
        {insights.formats.length === 0 ? (
          <p className="mt-3 text-xs text-ink-soft">No formats detected yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {insights.formats.map((f) => (
              <li key={f.label} className="flex items-center justify-between text-sm">
                <span className="text-ink">{f.label}</span>
                <span className="text-ink-soft">×{f.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Videos tab ────────────────────────────────────────────────────────────────
function VideosTab({
  clientId,
  videos,
  selectedIds,
  onToggleSelect,
  onVideosChange,
}: {
  clientId: string;
  videos: Video[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onVideosChange: (videos: Video[]) => void;
}) {
  const [modal, setModal] = useState<Video | null>(null);
  const [pending, start] = useTransition();
  const ownCount = videos.filter((v) => v.clientId !== null).length;

  function toggleStar(v: Video) {
    if (v.clientId === null) return; // legacy/global — read-only
    const next = !v.starred;
    onVideosChange(videos.map((x) => (x.id === v.id ? { ...x, starred: next } : x)));
    start(async () => {
      try {
        await starVideo(clientId, v.id, next);
      } catch {
        onVideosChange(videos.map((x) => (x.id === v.id ? { ...x, starred: !next } : x)));
      }
    });
  }

  function del(v: Video) {
    if (v.clientId === null) return;
    if (!window.confirm("Delete this video from your board?")) return;
    start(async () => {
      try {
        await removeVideo(clientId, v.id);
        onVideosChange(videos.filter((x) => x.id !== v.id));
      } catch {
        /* no-op */
      }
    });
  }

  function clearMine() {
    if (ownCount === 0) return;
    if (!window.confirm(`Clear all ${ownCount} of your scraped videos? Legacy/shared videos stay.`))
      return;
    start(async () => {
      try {
        await clearVideos(clientId);
        onVideosChange(videos.filter((x) => x.clientId === null));
      } catch {
        /* no-op */
      }
    });
  }

  if (videos.length === 0) {
    return (
      <div className="card border-dashed bg-cream/40 py-12 text-center text-sm text-ink-soft">
        No competitor videos yet. Once the scrape pipeline is wired, your runs land here.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {videos.length} videos · {selectedIds.size} selected for ideation
        </p>
        {ownCount > 0 && (
          <button
            onClick={clearMine}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 size={14} strokeWidth={1.75} /> Clear my videos
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {videos.map((v) => (
          <VideoCard
            key={v.id}
            video={v}
            selected={selectedIds.has(v.id)}
            onToggleSelect={() => onToggleSelect(v.id)}
            onOpen={() => setModal(v)}
            onStar={() => toggleStar(v)}
            onDelete={() => del(v)}
          />
        ))}
      </div>

      {modal && <VideoModal video={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

function VideoCard({
  video,
  selected,
  onToggleSelect,
  onOpen,
  onStar,
  onDelete,
}: {
  video: Video;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onStar: () => void;
  onDelete: () => void;
}) {
  const isLegacy = video.clientId === null;
  return (
    <div
      className={`overflow-hidden rounded-lg border bg-paper transition-colors ${
        selected ? "border-gold" : "border-line"
      }`}
    >
      <button onClick={onOpen} className="relative block aspect-[4/5] w-full bg-cream">
        {video.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail}
            alt={video.creator ?? "competitor video"}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-ink-soft">
            <Film size={24} strokeWidth={1.25} />
          </span>
        )}
        {video.starred && (
          <span className="absolute right-2 top-2 rounded-full bg-gold p-1 text-white shadow">
            <Star size={12} fill="currentColor" strokeWidth={0} />
          </span>
        )}
      </button>

      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-ink">
            @{video.creator ?? "unknown"}
          </p>
          {isLegacy && (
            <span className="shrink-0 rounded bg-cream px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-soft">
              shared
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-ink-soft">
          <span className="inline-flex items-center gap-1">
            <Eye size={12} /> {fmt(video.views)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Heart size={12} /> {fmt(video.likes)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare size={12} /> {fmt(video.comments)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-ink">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-3.5 w-3.5 accent-[color:var(--gold,#c19a5b)]"
            />
            Use in ideation
          </label>
          <div className="flex items-center gap-0.5">
            <button
              onClick={onStar}
              disabled={isLegacy}
              title={isLegacy ? "Shared videos can't be starred" : "Star"}
              className="rounded p-1 text-ink-soft transition-colors hover:bg-gold-tint/40 hover:text-gold-deep disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Star size={14} strokeWidth={1.75} fill={video.starred ? "currentColor" : "none"} />
            </button>
            <button
              onClick={onDelete}
              disabled={isLegacy}
              title={isLegacy ? "Shared videos can't be deleted" : "Delete"}
              className="rounded p-1 text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoModal({ video, onClose }: { video: Video; onClose: () => void }) {
  const [tab, setTab] = useState<"analysis" | "concepts">("analysis");
  const body = tab === "analysis" ? video.analysis : video.newConcepts;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-line bg-paper shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-4">
          <div className="min-w-0">
            <p className="truncate font-display text-base text-ink">@{video.creator ?? "unknown"}</p>
            <p className="mt-0.5 text-xs text-ink-soft">
              {fmt(video.views)} views · {fmt(video.likes)} likes · {fmt(video.comments)} comments
              {video.link && (
                <>
                  {" · "}
                  <a href={video.link} target="_blank" rel="noreferrer" className="text-gold-deep underline">
                    open
                  </a>
                </>
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-ink-soft hover:bg-cream hover:text-ink">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-line px-4 pt-3">
          {(["analysis", "concepts"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t-md px-3 py-2 text-sm transition-colors ${
                tab === t ? "border-b-2 border-gold font-medium text-ink" : "text-ink-soft hover:text-ink"
              }`}
            >
              {t === "analysis" ? "Analysis" : "New concepts"}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto p-4 text-sm">
          {body && body.trim() ? (
            <Markdown>{body}</Markdown>
          ) : (
            <p className="py-6 text-center text-ink-soft">
              {tab === "analysis" ? "No analysis on file." : "No new concepts on file."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Creators tab (read; add/refresh held) ────────────────────────────────────
function CreatorsTab({ clientId }: { clientId: string }) {
  const [creators, setCreators] = useState<Creator[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listCompetitorCreators(clientId)
      .then((c) => live && setCreators(c))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load creators."));
    return () => {
      live = false;
    };
  }, [clientId]);

  return (
    <div className="space-y-4">
      <HeldNotice
        icon={Plus}
        label="Add creator & refresh stats"
        detail="Adding a creator and refreshing 30-day stats (a live SSE scrape) runs through the SMAI pipeline — wired once the per-client scrape contract lands."
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {creators === null ? (
        <Loading />
      ) : creators.length === 0 ? (
        <Empty text="No creators tracked yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="py-2 pr-3 font-medium">Creator</th>
                <th className="py-2 pr-3 font-medium">Followers</th>
                <th className="py-2 pr-3 font-medium">Reels 30d</th>
                <th className="py-2 pr-3 font-medium">Avg views 30d</th>
                <th className="py-2 font-medium">
                  <RefreshCw size={12} strokeWidth={1.75} className="inline text-ink-soft/50" />
                </th>
              </tr>
            </thead>
            <tbody>
              {creators.map((c) => (
                <tr key={c.id} className="border-b border-line/60">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium text-ink">@{c.username}</span>
                    {c.clientId === null && (
                      <span className="ml-2 rounded bg-cream px-1.5 py-0.5 text-[9px] uppercase text-ink-soft">
                        shared
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-ink-soft">{fmt(c.followers)}</td>
                  <td className="py-2.5 pr-3 text-ink-soft">{fmt(c.reelsCount30d)}</td>
                  <td className="py-2.5 pr-3 text-ink-soft">{fmt(c.avgViews30d)}</td>
                  <td className="py-2.5 text-ink-soft/40">
                    <RefreshCw size={14} strokeWidth={1.75} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Configs tab (read; CRUD held) ────────────────────────────────────────────
function ConfigsTab({ clientId }: { clientId: string }) {
  const [configs, setConfigs] = useState<CompetitorConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listCompetitorConfigs(clientId)
      .then((c) => live && setConfigs(c))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load configs."));
    return () => {
      live = false;
    };
  }, [clientId]);

  return (
    <div className="space-y-4">
      <HeldNotice
        icon={Settings2}
        label="Create, edit & delete configs"
        detail="Config CRUD writes into the shared scrape configuration — wired once the SMAI contract is in reference/. Existing configs are shown read-only."
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {configs === null ? (
        <Loading />
      ) : configs.length === 0 ? (
        <Empty text="No configs yet." />
      ) : (
        <div className="space-y-3">
          {configs.map((c) => (
            <div key={c.id} className="card">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-display text-base text-ink">{c.configName}</h4>
                {c.clientId === null && (
                  <span className="rounded bg-cream px-1.5 py-0.5 text-[9px] uppercase text-ink-soft">
                    shared
                  </span>
                )}
              </div>
              {c.creatorsCategory && (
                <p className="mt-1 text-xs text-ink-soft">Category: {c.creatorsCategory}</p>
              )}
              {c.analysisInstruction && (
                <p className="mt-2 line-clamp-3 text-sm text-ink-soft">
                  <span className="font-medium text-ink">Analysis:</span> {c.analysisInstruction}
                </p>
              )}
              {c.newConceptsInstruction && (
                <p className="mt-1 line-clamp-3 text-sm text-ink-soft">
                  <span className="font-medium text-ink">New concepts:</span> {c.newConceptsInstruction}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Run Pipeline (held) ──────────────────────────────────────────────────────
function PipelineStub() {
  // TODO(session-8b): wire POST /api/pipeline through src/lib/research/smai.ts once
  // the SMAI repo is in reference/ and the pipeline accepts + tags a client_id.
  // Inputs to send: { configName, maxVideos, topK, daysLookback, client_id }.
  // Then poll run status and show progress.
  return (
    <div className="card flex flex-col items-center gap-3 border-dashed bg-cream/40 py-12 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-tint text-gold-deep">
        <Play size={20} strokeWidth={1.5} />
      </span>
      <div>
        <div className="flex items-center justify-center gap-2">
          <h3 className="font-display text-base text-ink">Run a scrape</h3>
          <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
            <Lock size={10} strokeWidth={2} /> Coming
          </span>
        </div>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-soft">
          Pick a config, set max videos / top K / days lookback, and trigger a per-client
          scrape with live progress. Wired once the SMAI pipeline can tag runs to a client.
        </p>
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
function HeldNotice({
  icon: Icon,
  label,
  detail,
}: {
  icon: typeof Play;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-line bg-cream/40 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-tint text-gold-deep">
        <Icon size={15} strokeWidth={1.75} />
      </span>
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-ink">{label}</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-cream px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-soft">
            <Lock size={10} strokeWidth={2} /> Coming
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-soft">{detail}</p>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-soft">
      <Loader2 size={16} className="animate-spin" /> Loading…
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="card border-dashed bg-cream/40 py-10 text-center text-sm text-ink-soft">
      {text}
    </div>
  );
}

function fmt(n: number | null | undefined): string {
  if (typeof n !== "number") return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
