import type { EngagementPoint } from "@/lib/social";

const H = 220;
const W = 800;
const PAD_L = 48;
const PAD_R = 14;
const PAD_T = 14;
const PAD_B = 28;

/**
 * Engagement over time. Mirrors the reference dashboard's chart section,
 * redrawn in the Resonance palette (gold line over a cream-tinted area).
 *
 * With no points it renders the same framed plot area with faint gridlines and
 * an empty state, so the section reads as "a chart lives here, once connected"
 * rather than as a broken or fabricated chart.
 */
export default function EngagementChart({
  points,
}: {
  points: EngagementPoint[];
}) {
  if (points.length === 0) return <EmptyPlot />;

  const max = Math.max(...points.map((p) => p.engagement), 1);
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const xs = (i: number) =>
    points.length === 1 ? PAD_L + innerW / 2 : PAD_L + (i / (points.length - 1)) * innerW;
  const ys = (v: number) => PAD_T + innerH - (v / max) * innerH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xs(i).toFixed(2)} ${ys(p.engagement).toFixed(2)}`)
    .join(" ");
  const areaD =
    `${pathD} L ${xs(points.length - 1).toFixed(2)} ${(PAD_T + innerH).toFixed(2)}` +
    ` L ${xs(0).toFixed(2)} ${(PAD_T + innerH).toFixed(2)} Z`;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    y: ys(max * r),
    label: Math.round(max * r).toLocaleString("en-GB"),
  }));

  const stride = Math.max(1, Math.ceil(points.length / 8));
  const xLabels = points
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % stride === 0 || i === points.length - 1);

  return (
    <div className="relative w-full" style={{ height: H }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ height: H, display: "block" }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="rumi-eng-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--gold))" stopOpacity="0.20" />
            <stop offset="100%" stopColor="rgb(var(--gold))" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((t, i) => (
          <line
            key={i}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={t.y}
            y2={t.y}
            stroke="rgb(var(--line))"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={areaD} fill="url(#rumi-eng-area)" />
        <path
          d={pathD}
          fill="none"
          stroke="rgb(var(--gold))"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Axis labels are HTML so preserveAspectRatio="none" can't stretch them. */}
      <div className="pointer-events-none absolute inset-0 text-[11px] tabular-nums text-ink-soft">
        {ticks.map((t, i) => (
          <span
            key={`y-${i}`}
            className="absolute text-right leading-none"
            style={{ top: t.y, left: 0, width: PAD_L - 8, transform: "translateY(-50%)" }}
          >
            {t.label}
          </span>
        ))}
        {xLabels.map(({ p, i }) => (
          <span
            key={`x-${p.date}`}
            className="absolute whitespace-nowrap"
            style={{
              left: `${(xs(i) / W) * 100}%`,
              bottom: 4,
              transform:
                i === 0
                  ? "translateX(0)"
                  : i === points.length - 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {p.date.slice(5)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The shell state: real plot furniture, no invented series. */
function EmptyPlot() {
  const innerH = H - PAD_T - PAD_B;
  const rows = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative w-full" style={{ height: H }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ height: H, display: "block" }}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {rows.map((r, i) => (
          <line
            key={i}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={PAD_T + innerH - r * innerH}
            y2={PAD_T + innerH - r * innerH}
            stroke="rgb(var(--line))"
            strokeWidth={1}
            strokeDasharray={i === 0 ? undefined : "3 5"}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        <p className="max-w-xs px-4 text-center text-sm text-ink-soft">
          No data yet — connect Instagram to see your engagement.
        </p>
      </div>
    </div>
  );
}
