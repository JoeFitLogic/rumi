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
  Flame,
  Hash,
  Film,
  RefreshCw,
  Plus,
  Save,
  Pencil,
  Check,
  AlertTriangle,
} from "lucide-react";
import Markdown from "@/components/Markdown";
import { StepIntro } from "./researchUi";
import { deriveInsights } from "@/lib/research/insights";
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
} from "@/lib/research/types";

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
      {tab === "pipeline" && (
        <RunPipelineTab clientId={clientId} onVideosChange={onVideosChange} />
      )}
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

// ── Creators tab (add / delete own · refresh own via SMAI SSE) ────────────────
function CreatorsTab({ clientId }: { clientId: string }) {
  const [creators, setCreators] = useState<Creator[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [category, setCategory] = useState("");
  const [adding, startAdd] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listCompetitorCreators(clientId)
      .then((c) => live && setCreators(c))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Failed to load creators."));
    return () => {
      live = false;
    };
  }, [clientId]);

  const ownedIds = (creators ?? []).filter((c) => c.clientId !== null).map((c) => c.id);

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
    if (c.clientId === null) return;
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
                    {c.clientId === null && (
                      <span className="ml-2 rounded bg-cream px-1.5 py-0.5 text-[9px] uppercase text-ink-soft">
                        shared
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-ink-soft">{fmt(c.followers)}</td>
                  <td className="py-2.5 pr-3 text-ink-soft">{fmt(c.reelsCount30d)}</td>
                  <td className="py-2.5 pr-3 text-ink-soft">{fmt(c.avgViews30d)}</td>
                  <td className="py-2.5 text-right">
                    {c.clientId !== null && (
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
  const isLegacy = c.clientId === null;
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
  const [run, setRun] = useState<{ runId: string; sinceDay: string; configName: string } | null>(null);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

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

  function run_() {
    if (!configName) {
      setError("Pick a config first.");
      return;
    }
    if (!window.confirm("Run a live scrape? This uses Apify + AI credits on the SMAI pipeline.")) return;
    setError(null);
    setClaimMsg(null);
    startRun(async () => {
      try {
        const started = await startPipeline(clientId, { configName, maxVideos, topK, nDays });
        setRun({ runId: started.runId, sinceDay: started.sinceDay, configName: started.configName });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to start pipeline.");
      }
    });
  }

  function loadResults() {
    if (!run) return;
    startClaim(async () => {
      try {
        const { claimed } = await claimPipelineVideos(clientId, run.sinceDay, run.configName);
        const videos = await listCompetitorVideos(clientId);
        onVideosChange(videos);
        setClaimMsg(
          claimed > 0
            ? `Loaded ${claimed} new video${claimed === 1 ? "" : "s"} into your board.`
            : "No new videos yet — the scrape may still be running. Try again in a moment."
        );
      } catch (e) {
        setClaimMsg(e instanceof Error ? e.message : "Failed to load results.");
      }
    });
  }

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
                      {c.clientId === null ? " (shared)" : ""}
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
        <div className="card space-y-3 border-gold/40 bg-gold-tint/20">
          <div className="flex items-start gap-2.5">
            <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-gold-deep" />
            <div>
              <p className="text-sm font-medium text-ink">
                Scrape running for “{run.configName}”
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">
                Runs in the background on the SMAI pipeline (a few minutes). When it finishes,
                load the results to claim them into your board.
              </p>
              <p className="mt-1 font-mono text-[10px] text-ink-soft/70">run {run.runId}</p>
            </div>
          </div>
          {claimMsg && <p className="text-sm text-ink">{claimMsg}</p>}
          <button onClick={loadResults} disabled={claiming} className="btn-ghost px-3 py-1.5 text-xs">
            {claiming ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Loading…
              </>
            ) : (
              <>
                <Check size={14} strokeWidth={2} /> Load results
              </>
            )}
          </button>
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
