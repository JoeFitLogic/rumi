"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  Flame,
  Film,
  RefreshCw,
  Plus,
  Save,
  Pencil,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  TrendingUp,
} from "lucide-react";
import Markdown from "@/components/Markdown";
import { deriveInsights } from "@/lib/research/insights";
import {
  buildBaselines,
  outlierFor,
  formatMultiple,
  sortByOutlier,
  scoredCount,
  OUTLIER_THRESHOLD,
  type Baseline,
  type Outlier,
} from "@/lib/research/outliers";
import {
  listCompetitorCreators,
  listCompetitorConfigs,
  listCompetitorVideos,
  starVideo,
  removeVideo,
  clearVideos,
  createConfig,
  updateConfig,
  deleteConfig,
  addCreator,
  removeCreator,
  startPipeline,
  claimPipelineVideos,
} from "./actions";
import type {
  Video,
  Creator,
  CompetitorConfig,
  ConfigInput,
  PipelineProgress,
} from "@/lib/research/types";
import { PIPELINE_TERMINAL, isSharedRow } from "@/lib/research/types";

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
  // Creators live HERE rather than inside CreatorsTab: the outlier baseline is
  // creators.avgViews30d, so the Videos tab and the insights box need them too,
  // and a stats refresh has to move every score on the page, not just its own
  // tab's numbers.
  const [creators, setCreators] = useState<Creator[] | null>(null);
  const insights = useMemo(() => deriveInsights(videos), [videos]);
  const baselines = useMemo(() => buildBaselines(creators), [creators]);

  useEffect(() => {
    let live = true;
    listCompetitorCreators(clientId)
      .then((c) => live && setCreators(c))
      .catch(() => live && setCreators([]));
    return () => {
      live = false;
    };
  }, [clientId]);

  return (
    <div className="space-y-6">
      <Insights insights={insights} videos={videos} baselines={baselines} />

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
          baselines={baselines}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
          onVideosChange={onVideosChange}
        />
      )}
      {tab === "pipeline" && (
        <RunPipelineTab clientId={clientId} onVideosChange={onVideosChange} />
      )}
      {tab === "creators" && (
        <CreatorsTab clientId={clientId} creators={creators} onCreatorsChange={setCreators} />
      )}
      {tab === "configs" && <ConfigsTab clientId={clientId} />}
    </div>
  );
}

// ── Most applicable videos ───────────────────────────────────────────────────
//
// Ranked by outlier score: how far each video beat its OWN creator's 30-day
// average, which is a fairer signal than raw views (a 3k-view post from a small
// account can be a bigger win than a 50k post from a large one). The spoken hook
// and the why-it-fits line are a later session; for now this shows the outlier
// alongside the heuristic hook the analysis text already yields.
const APPLICABLE_COUNT = 6;

function Insights({
  insights,
  videos,
  baselines,
}: {
  insights: ReturnType<typeof deriveInsights>;
  videos: Video[];
  baselines: Map<string, Baseline>;
}) {
  const ranked = useMemo(() => {
    const scored = sortByOutlier(videos, baselines)
      .map((v) => ({ video: v, outlier: outlierFor(v, baselines) }))
      .filter((r) => r.outlier.kind === "scored");
    return scored.slice(0, APPLICABLE_COUNT);
  }, [videos, baselines]);

  if (insights.videoCount === 0) {
    return (
      <div className="card border-dashed bg-cream/40 py-8 text-center text-sm text-ink-soft">
        Insights appear once there are analysed competitor videos below.
      </div>
    );
  }

  // Nothing scoreable: say what to do about it rather than showing an empty box.
  if (ranked.length === 0) {
    return (
      <div className="card">
        <h3 className="flex items-center gap-2 font-display text-base text-ink">
          <Flame size={16} strokeWidth={1.75} className="text-gold" /> Most applicable videos
        </h3>
        <p className="mt-3 text-sm text-ink-soft">
          No baselines yet, so nothing can be ranked. Open the Creators tab and
          hit <span className="font-medium text-ink">Refresh 30-day stats</span> —
          that pulls each creator&rsquo;s average views, which is what a video is
          scored against.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="flex items-center gap-2 font-display text-base text-ink">
        <Flame size={16} strokeWidth={1.75} className="text-gold" /> Most applicable videos
      </h3>
      <p className="mt-1 text-xs text-ink-soft">
        Ranked by how far each one beat that creator&rsquo;s own 30-day average.
      </p>
      <ul className="mt-3 space-y-2.5">
        {ranked.map(({ video, outlier }) => {
          const hook = insights.hooks.find((h) => h.creator === video.creator);
          const multiple = outlier.kind === "scored" ? outlier.multiple : 0;
          const stale = outlier.kind === "scored" && outlier.baseline.stale;
          return (
            <li key={video.id} className="border-l-2 border-gold pl-3 text-sm text-ink">
              <span className="font-medium text-gold-deep">{formatMultiple(multiple)}</span>{" "}
              {hook ? <>&ldquo;{hook.text}&rdquo;</> : <span className="text-ink-soft">No hook line detected in the analysis.</span>}
              <span className="mt-0.5 block text-[11px] text-ink-soft">
                @{video.creator ?? "unknown"}
                {typeof video.views === "number" ? ` · ${fmt(video.views)} views` : ""}
                {stale ? " · baseline approx" : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// How many videos the grid shows before "show more".
const COLLAPSED_VIDEOS = 3;

// ── Videos tab ────────────────────────────────────────────────────────────────
function VideosTab({
  clientId,
  videos,
  baselines,
  selectedIds,
  onToggleSelect,
  onVideosChange,
}: {
  clientId: string;
  videos: Video[];
  baselines: Map<string, Baseline>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onVideosChange: (videos: Video[]) => void;
}) {
  const [modal, setModal] = useState<Video | null>(null);
  const [expanded, setExpanded] = useState(false);
  // Outlier-first by default: a 5x post is signal, a 1x post is just a post.
  // Videos we cannot score keep their view order behind the scored ones.
  const [sort, setSort] = useState<"outlier" | "views">("outlier");
  const [pending, start] = useTransition();
  const ownCount = videos.filter((v) => !isSharedRow(v.clientId)).length;
  // A full scrape lands ~60 videos. Showing them all buried the rest of the
  // step, so the grid opens on the first row and expands on demand.
  const scored = useMemo(() => scoredCount(videos, baselines), [videos, baselines]);
  const ordered = useMemo(
    () => (sort === "outlier" ? sortByOutlier(videos, baselines) : videos),
    [sort, videos, baselines]
  );
  const shown = expanded ? ordered : ordered.slice(0, COLLAPSED_VIDEOS);
  const hidden = ordered.length - shown.length;

  function toggleStar(v: Video) {
    if (isSharedRow(v.clientId)) return; // shared — read-only
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
    if (isSharedRow(v.clientId)) return;
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
        onVideosChange(videos.filter((x) => isSharedRow(x.clientId)));
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {videos.length} videos · {selectedIds.size} selected for ideation
          {scored > 0 ? ` · ${scored} scored` : ""}
        </p>
        <div className="flex items-center gap-2">
          {scored > 0 && (
            <div className="inline-flex rounded-lg border border-line bg-cream/50 p-0.5 text-xs">
              {(["outlier", "views"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setSort(k)}
                  className={`rounded-md px-2 py-1 transition-colors ${
                    sort === k ? "bg-paper font-medium text-ink shadow-sm" : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {k === "outlier" ? "Top outliers" : "Most viewed"}
                </button>
              ))}
            </div>
          )}
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
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {shown.map((v) => (
          <VideoCard
            key={v.id}
            video={v}
            outlier={outlierFor(v, baselines)}
            selected={selectedIds.has(v.id)}
            onToggleSelect={() => onToggleSelect(v.id)}
            onOpen={() => setModal(v)}
            onStar={() => toggleStar(v)}
            onDelete={() => del(v)}
          />
        ))}
      </div>

      {videos.length > COLLAPSED_VIDEOS && (
        <button
          onClick={() => setExpanded((x) => !x)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-paper py-2.5 text-sm text-ink-soft transition-colors hover:border-gold/50 hover:text-ink"
        >
          {expanded ? (
            <>
              <ChevronUp size={15} strokeWidth={1.75} /> Show fewer
            </>
          ) : (
            <>
              <ChevronDown size={15} strokeWidth={1.75} /> Show {hidden} more video
              {hidden === 1 ? "" : "s"}
            </>
          )}
        </button>
      )}

      {modal && <VideoModal video={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

function VideoCard({
  video,
  outlier,
  selected,
  onToggleSelect,
  onOpen,
  onStar,
  onDelete,
}: {
  video: Video;
  outlier: Outlier;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onStar: () => void;
  onDelete: () => void;
}) {
  const isLegacy = isSharedRow(video.clientId);
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
        {outlier.kind === "scored" && outlier.multiple >= OUTLIER_THRESHOLD && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
            <TrendingUp size={10} strokeWidth={2.5} /> {formatMultiple(outlier.multiple)}
          </span>
        )}
      </button>

      <div className="space-y-1.5 p-2.5">
        <div className="flex items-center justify-between gap-1.5">
          <p className="truncate text-xs font-medium text-ink">
            @{video.creator ?? "unknown"}
          </p>
          {isLegacy && (
            <span className="shrink-0 rounded bg-cream px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-ink-soft">
              shared
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-ink-soft">
          <span className="inline-flex items-center gap-0.5">
            <Eye size={11} /> {fmt(video.views)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Heart size={11} /> {fmt(video.likes)}
          </span>
          <span className="inline-flex items-center gap-0.5">
            <MessageSquare size={11} /> {fmt(video.comments)}
          </span>
        </div>

        <OutlierLine outlier={outlier} />

        <div className="flex items-center justify-between gap-1 pt-0.5">
          <label className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-ink">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="h-3 w-3 accent-[color:var(--gold,#ab8115)]"
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
              <Star size={13} strokeWidth={1.75} fill={video.starred ? "currentColor" : "none"} />
            </button>
            <button
              onClick={onDelete}
              disabled={isLegacy}
              title={isLegacy ? "Shared videos can't be deleted" : "Delete"}
              className="rounded p-1 text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The score, or plainly why there isn't one. A missing baseline is never shown
 * as a number: an unrefreshed creator is missing information, not a flop.
 */
function OutlierLine({ outlier }: { outlier: Outlier }) {
  if (outlier.kind === "unknown-creator") {
    return (
      <p className="text-[10px] text-ink-soft/80" title="This video's account isn't in your creators list, so there's nothing to compare it against.">
        No baseline · creator not tracked
      </p>
    );
  }
  if (outlier.kind === "no-baseline") {
    return (
      <p className="text-[10px] text-ink-soft/80" title="Hit 'Refresh 30-day stats' on the Creators tab to get this creator's average.">
        No baseline yet · refresh this creator
      </p>
    );
  }
  const { multiple, baseline } = outlier;
  const strong = multiple >= OUTLIER_THRESHOLD;
  return (
    <p className={`text-[10px] ${strong ? "font-medium text-gold-deep" : "text-ink-soft"}`}>
      {formatMultiple(multiple)} their average
      {baseline.stale ? (
        <span
          className="text-ink-soft/80"
          title={`@${baseline.username}'s stats were last scraped ${baseline.ageDays} days ago, so this is approximate.`}
        >
          {" "}
          · approx
        </span>
      ) : null}
    </p>
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

// ── Creators tab (add / delete own · refresh own via SMAI SSE) ────────────────
function CreatorsTab({
  clientId,
  creators,
  onCreatorsChange,
}: {
  clientId: string;
  creators: Creator[] | null;
  onCreatorsChange: (update: (prev: Creator[] | null) => Creator[] | null) => void;
}) {
  const setCreators = onCreatorsChange;
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [category, setCategory] = useState("");
  const [adding, startAdd] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const ownedIds = (creators ?? []).filter((c) => !isSharedRow(c.clientId)).map((c) => c.id);

  function add() {
    if (!username.trim()) return;
    setError(null);
    startAdd(async () => {
      try {
        const created = await addCreator(clientId, username, category);
        setCreators((prev) => [created, ...(prev ?? [])]);
        setUsername("");
        setCategory("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add creator.");
      }
    });
  }

  function del(c: Creator) {
    if (isSharedRow(c.clientId)) return;
    if (!window.confirm(`Remove @${c.username}?`)) return;
    startAdd(async () => {
      try {
        await removeCreator(clientId, c.id);
        setCreators((prev) => (prev ?? []).filter((x) => x.id !== c.id));
      } catch {
        /* no-op */
      }
    });
  }

  // Refresh 30-day stats for the client's OWN creators via the server-side SSE
  // proxy. EventSource is same-origin + cookie-authed; the route scopes to owned.
  function refresh() {
    if (ownedIds.length === 0 || refreshing) return;
    setRefreshing(true);
    setRefreshMsg("Starting…");
    const url = `/api/research/creators/refresh?clientId=${encodeURIComponent(clientId)}&ids=${encodeURIComponent(ownedIds.join(","))}`;
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "progress") {
          setRefreshMsg(`${msg.status === "done" ? "Updated" : "Scraping"} @${msg.username}…`);
          if (msg.status === "done" && msg.stats) {
            setCreators((prev) =>
              (prev ?? []).map((c) =>
                c.username === msg.username
                  ? {
                      ...c,
                      followers: msg.stats.followers ?? c.followers,
                      reelsCount30d: msg.stats.reelsCount30d ?? c.reelsCount30d,
                      avgViews30d: msg.stats.avgViews30d ?? c.avgViews30d,
                      profilePicUrl: msg.stats.profilePicUrl ?? c.profilePicUrl,
                    }
                  : c
              )
            );
          }
        } else if (msg.type === "error") {
          setRefreshMsg(`Error on @${msg.username}: ${msg.error}`);
        } else if (msg.type === "complete") {
          setRefreshMsg("Stats refreshed.");
          es.close();
          setRefreshing(false);
          setTimeout(() => setRefreshMsg(null), 4000);
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    es.onerror = () => {
      setRefreshMsg("Refresh connection lost.");
      es.close();
      setRefreshing(false);
    };
  }

  return (
    <div className="space-y-4">
      {/* Add creator */}
      <div className="card space-y-3">
        <h3 className="font-display text-base text-ink">Track a competitor</h3>
        <div className="grid gap-3 sm:grid-cols-[2fr_1.5fr_auto]">
          <input
            className="input"
            placeholder="Instagram username (e.g. markstrathern_)"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <input
            className="input"
            placeholder="Category (optional)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button onClick={add} disabled={adding || !username.trim()} className="btn-primary">
            {adding ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} strokeWidth={1.75} />} Add
          </button>
        </div>
        <p className="text-xs text-ink-soft">
          New creators start with empty stats — hit “Refresh stats” to scrape their last 30 days.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">{creators?.length ?? 0} creators</p>
        <div className="flex items-center gap-3">
          {refreshMsg && <span className="text-xs text-ink-soft">{refreshMsg}</span>}
          <button
            onClick={refresh}
            disabled={refreshing || ownedIds.length === 0}
            title={ownedIds.length === 0 ? "Add a creator first" : "Refresh 30-day stats for your creators"}
            className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {refreshing ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Refreshing…
              </>
            ) : (
              <>
                <RefreshCw size={14} strokeWidth={1.75} /> Refresh stats
              </>
            )}
          </button>
        </div>
      </div>

      {creators === null ? (
        <Loading />
      ) : creators.length === 0 ? (
        <Empty text="No creators tracked yet. Add one above." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="py-2 pr-3 font-medium">Creator</th>
                <th className="py-2 pr-3 font-medium">Followers</th>
                <th className="py-2 pr-3 font-medium">Reels 30d</th>
                <th className="py-2 pr-3 font-medium">Avg views 30d</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {creators.map((c) => (
                <tr key={c.id} className="border-b border-line/60">
                  <td className="py-2.5 pr-3">
                    <span className="font-medium text-ink">@{c.username}</span>
                    {isSharedRow(c.clientId) && (
                      <span className="ml-2 rounded bg-cream px-1.5 py-0.5 text-[9px] uppercase text-ink-soft">
                        shared
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-ink-soft">{fmt(c.followers)}</td>
                  <td className="py-2.5 pr-3 text-ink-soft">{fmt(c.reelsCount30d)}</td>
                  <td className="py-2.5 pr-3 text-ink-soft">{fmt(c.avgViews30d)}</td>
                  <td className="py-2.5 text-right">
                    {!isSharedRow(c.clientId) && (
                      <button
                        onClick={() => del(c)}
                        className="rounded p-1 text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Remove"
                      >
                        <Trash2 size={14} strokeWidth={1.75} />
                      </button>
                    )}
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

// ── Configs tab (full CRUD for own configs; legacy read-only) ─────────────────
const EMPTY_CONFIG: ConfigInput = {
  configName: "",
  creatorsCategory: "",
  analysisInstruction: "",
  newConceptsInstruction: "",
};

function ConfigsTab({ clientId }: { clientId: string }) {
  const [configs, setConfigs] = useState<CompetitorConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

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
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">{configs?.length ?? 0} configs</p>
        {!creating && (
          <button onClick={() => setCreating(true)} className="btn-primary px-3 py-1.5 text-xs">
            <Plus size={14} strokeWidth={1.75} /> New config
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {creating && (
        <ConfigForm
          initial={EMPTY_CONFIG}
          onCancel={() => setCreating(false)}
          onSave={async (input) => {
            const created = await createConfig(clientId, input);
            setConfigs((prev) => [created, ...(prev ?? [])]);
            setCreating(false);
          }}
        />
      )}

      {configs === null ? (
        <Loading />
      ) : configs.length === 0 && !creating ? (
        <Empty text="No configs yet. Create one to define a scrape." />
      ) : (
        <div className="space-y-3">
          {configs.map((c) =>
            editId === c.id ? (
              <ConfigForm
                key={c.id}
                initial={{
                  configName: c.configName,
                  creatorsCategory: c.creatorsCategory ?? "",
                  analysisInstruction: c.analysisInstruction ?? "",
                  newConceptsInstruction: c.newConceptsInstruction ?? "",
                }}
                onCancel={() => setEditId(null)}
                onSave={async (input) => {
                  await updateConfig(clientId, c.id, input);
                  setConfigs((prev) =>
                    (prev ?? []).map((x) => (x.id === c.id ? { ...x, ...input } : x))
                  );
                  setEditId(null);
                }}
              />
            ) : (
              <ConfigCard
                key={c.id}
                config={c}
                onEdit={() => setEditId(c.id)}
                onDelete={async () => {
                  if (!window.confirm(`Delete config “${c.configName}”?`)) return;
                  await deleteConfig(clientId, c.id);
                  setConfigs((prev) => (prev ?? []).filter((x) => x.id !== c.id));
                }}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function ConfigCard({
  config: c,
  onEdit,
  onDelete,
}: {
  config: CompetitorConfig;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [pending, start] = useTransition();
  const isLegacy = isSharedRow(c.clientId);
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-display text-base text-ink">{c.configName}</h4>
        <div className="flex items-center gap-1">
          {isLegacy ? (
            <span className="rounded bg-cream px-1.5 py-0.5 text-[9px] uppercase text-ink-soft">
              shared
            </span>
          ) : (
            <>
              <button onClick={onEdit} className="rounded p-1 text-ink-soft hover:bg-gold-tint/40 hover:text-gold-deep" title="Edit">
                <Pencil size={14} strokeWidth={1.75} />
              </button>
              <button
                onClick={() => start(onDelete)}
                disabled={pending}
                className="rounded p-1 text-ink-soft hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                title="Delete"
              >
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>
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
  );
}

function ConfigForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: ConfigInput;
  onSave: (input: ConfigInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ConfigInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof ConfigInput, v: string) => setForm((p) => ({ ...p, [k]: v }));

  function save() {
    if (!form.configName.trim()) {
      setError("Config name is required.");
      return;
    }
    setError(null);
    start(async () => {
      try {
        await onSave(form);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed.");
      }
    });
  }

  return (
    <div className="card space-y-3 border-gold/40">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink">Config name</label>
          <input className="input" value={form.configName} onChange={(e) => set("configName", e.target.value)} placeholder="e.g. Fitness Coaches" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink">Creators category</label>
          <input className="input" value={form.creatorsCategory} onChange={(e) => set("creatorsCategory", e.target.value)} placeholder="matches creators' category" />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink">Analysis instruction</label>
        <textarea className="input min-h-[72px] resize-y text-sm" value={form.analysisInstruction} onChange={(e) => set("analysisInstruction", e.target.value)} placeholder="How Gemini should break down each video…" />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-ink">New-concepts instruction</label>
        <textarea className="input min-h-[72px] resize-y text-sm" value={form.newConceptsInstruction} onChange={(e) => set("newConceptsInstruction", e.target.value)} placeholder="How Claude should adapt it for this brand…" />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={pending} className="btn-primary px-3 py-1.5 text-xs">
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={1.75} />} Save
        </button>
        <button onClick={onCancel} disabled={pending} className="btn-ghost px-3 py-1.5 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Run Pipeline (trigger via SMAI + claim results to this client) ────────────
function RunPipelineTab({
  clientId,
  onVideosChange,
}: {
  clientId: string;
  onVideosChange: (videos: Video[]) => void;
}) {
  const [configs, setConfigs] = useState<CompetitorConfig[] | null>(null);
  const [configName, setConfigName] = useState("");
  const [maxVideos, setMaxVideos] = useState(20);
  const [topK, setTopK] = useState(3);
  const [nDays, setNDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [starting, startRun] = useTransition();
  const [claiming, startClaim] = useTransition();
  const [run, setRun] = useState<{ runId: string; token: string; sinceDay: string; configName: string } | null>(null);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [runStatus, setRunStatus] = useState<string>("");
  const [claimMsg, setClaimMsg] = useState<string | null>(null);
  const claimedRef = useRef(false);

  useEffect(() => {
    let live = true;
    listCompetitorConfigs(clientId)
      .then((c) => {
        if (!live) return;
        setConfigs(c);
        if (c.length > 0) setConfigName(c[0].configName);
      })
      .catch(() => live && setConfigs([]));
    return () => {
      live = false;
    };
  }, [clientId]);

  const claimNow = useCallback(
    (r: { sinceDay: string; configName: string }, auto: boolean) => {
      if (claimedRef.current) return;
      claimedRef.current = true;
      startClaim(async () => {
        try {
          const { claimed } = await claimPipelineVideos(clientId, r.sinceDay, r.configName);
          const videos = await listCompetitorVideos(clientId);
          onVideosChange(videos);
          setClaimMsg(
            claimed > 0
              ? `Loaded ${claimed} new video${claimed === 1 ? "" : "s"} into your board.`
              : auto
                ? "Run finished but produced no new videos (check the log above)."
                : "No new videos yet — the scrape may still be running. Try again in a moment."
          );
        } catch (e) {
          claimedRef.current = false;
          setClaimMsg(e instanceof Error ? e.message : "Failed to load results.");
        }
      });
    },
    [clientId, onVideosChange]
  );

  // Poll live run status (Trigger.dev via public token) until terminal, then claim.
  useEffect(() => {
    if (!run) return;
    let live = true;
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/research/pipeline/status?clientId=${encodeURIComponent(clientId)}&runId=${encodeURIComponent(run.runId)}&token=${encodeURIComponent(run.token)}`,
          { cache: "no-store" }
        );
        if (!res.ok || !live) return;
        const data = (await res.json()) as { status: string; progress: PipelineProgress | null };
        if (!live) return;
        setRunStatus(data.status);
        if (data.progress) setProgress(data.progress);
        if (PIPELINE_TERMINAL.has(data.status)) {
          clearInterval(id);
          if (data.status === "COMPLETED") claimNow(run, true);
        }
      } catch {
        /* transient — keep polling */
      }
    };
    const id = setInterval(tick, 4000);
    tick();
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [run, clientId, claimNow]);

  function run_() {
    if (!configName) {
      setError("Pick a config first.");
      return;
    }
    if (!window.confirm("Run a live scrape? This uses Apify + AI credits on the SMAI pipeline.")) return;
    setError(null);
    setClaimMsg(null);
    setProgress(null);
    setRunStatus("");
    claimedRef.current = false;
    startRun(async () => {
      try {
        const started = await startPipeline(clientId, { configName, maxVideos, topK, nDays });
        setRun({
          runId: started.runId,
          token: started.publicToken,
          sinceDay: started.sinceDay,
          configName: started.configName,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start pipeline.");
      }
    });
  }

  const terminal = PIPELINE_TERMINAL.has(runStatus);
  const failed = terminal && runStatus !== "COMPLETED";
  // 0–40% scraping, 40–100% analyzing (mirrors SMAI's own progress weighting).
  const pct = !progress
    ? 0
    : progress.phase === "scraping"
      ? progress.creatorsTotal > 0
        ? (progress.creatorsScraped / progress.creatorsTotal) * 40
        : 0
      : progress.videosTotal > 0
        ? 40 + (progress.videosAnalyzed / progress.videosTotal) * 60
        : 40;
  const phaseLabel = failed
    ? "Failed"
    : runStatus === "COMPLETED"
      ? "Complete"
      : runStatus === "QUEUED" || (!progress && runStatus)
        ? "Queued"
        : progress?.phase === "analyzing"
          ? "Analyzing videos"
          : progress?.phase === "done"
            ? "Finishing"
            : "Scraping creators";

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <h3 className="font-display text-base text-ink">Run a scrape</h3>

        {configs !== null && configs.length === 0 ? (
          <div className="flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
            <span>Create a config first (Configs tab) — a run needs one to know which creators to scrape.</span>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink">Config</label>
                <select
                  className="input cursor-pointer"
                  value={configName}
                  onChange={(e) => setConfigName(e.target.value)}
                >
                  {(configs ?? []).map((c) => (
                    <option key={c.id} value={c.configName}>
                      {c.configName}
                      {isSharedRow(c.clientId) ? " (shared)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <NumberField label="Max videos" value={maxVideos} onChange={setMaxVideos} min={1} max={100} />
              <NumberField label="Top K (most viral)" value={topK} onChange={setTopK} min={1} max={20} />
              <NumberField label="Days lookback" value={nDays} onChange={setNDays} min={1} max={365} />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button onClick={run_} disabled={starting || !configName} className="btn-primary">
              {starting ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Starting…
                </>
              ) : (
                <>
                  <Play size={15} strokeWidth={1.75} /> Run scrape
                </>
              )}
            </button>
          </>
        )}
      </div>

      {run && (
        <div
          className={`card space-y-3 ${
            failed ? "border-red-300 bg-red-50/60" : "border-gold/40 bg-gold-tint/20"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {terminal ? (
              failed ? (
                <AlertTriangle size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-red-600" />
              ) : (
                <Check size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-emerald-600" />
              )
            ) : (
              <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-gold-deep" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {phaseLabel} — “{run.configName}”
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                {failed
                  ? "The pipeline run did not complete. No videos were claimed."
                  : runStatus === "COMPLETED"
                    ? "Run finished — results below have been claimed into your board."
                    : "Runs in the background on the SMAI pipeline (a few minutes). Progress updates live; results claim automatically when it finishes."}
              </p>
              <p className="mt-1 font-mono text-[10px] text-ink-soft/70">run {run.runId}</p>
            </div>
          </div>

          {!failed && (
            <div className="space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-parchment-dark/60">
                <div
                  className="h-full rounded-full bg-gold-deep transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
                />
              </div>
              {progress && (
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-ink-soft">
                  <span>
                    Creators {progress.creatorsScraped}/{progress.creatorsTotal || "?"}
                  </span>
                  <span>
                    Videos analyzed {progress.videosAnalyzed}/{progress.videosTotal || "?"}
                  </span>
                  {progress.errors.length > 0 && (
                    <span className="text-red-600">{progress.errors.length} error(s)</span>
                  )}
                </div>
              )}
            </div>
          )}

          {progress && progress.log.length > 0 && (
            <p className="truncate font-mono text-[10px] text-ink-soft/70">
              {progress.log[progress.log.length - 1]}
            </p>
          )}

          {claimMsg && <p className="text-sm text-ink">{claimMsg}</p>}

          {/* Manual claim as a fallback (auto-claim runs on COMPLETED). */}
          {(terminal || claimMsg) && (
            <button
              onClick={() => {
                claimedRef.current = false;
                claimNow(run, false);
              }}
              disabled={claiming}
              className="btn-ghost px-3 py-1.5 text-xs"
            >
              {claiming ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Loading…
                </>
              ) : (
                <>
                  <Check size={14} strokeWidth={2} /> Reload results
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-ink">{label}</label>
      <input
        type="number"
        className="input"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────
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
