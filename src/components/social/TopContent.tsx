import { fmtCell, fmtRate, type TopContentRow } from "@/lib/social";

/**
 * Top performing content. Same column structure as the reference dashboard's
 * table (rank, post, engagement rate, views, likes, saves, shares, date),
 * rebuilt with Rumi's hairline-divided table styling.
 *
 * The header row renders even when empty so the shape of what's coming is
 * legible; the empty state sits beneath it.
 */
export default function TopContent({ rows }: { rows: TopContentRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-line bg-cream/30 px-6 py-10 text-center">
        <p className="text-sm text-ink-soft">
          No posts yet — connect Instagram and your top posts will rank here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line">
            {["#", "Post", "Eng. rate", "Views", "Likes", "Saves", "Shares", "Date"].map(
              (h, i) => (
                <th
                  key={h}
                  className={`px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft ${
                    i >= 2 && i <= 6 ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-b border-line/60 last:border-0">
              <td className="px-3 py-3 tabular-nums text-ink-soft">{i + 1}</td>
              <td className="max-w-xs px-3 py-3">
                {r.permalink ? (
                  <a
                    href={r.permalink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-2 text-ink hover:text-gold-deep hover:underline"
                  >
                    {r.caption}
                  </a>
                ) : (
                  <span className="line-clamp-2 text-ink">{r.caption}</span>
                )}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-ink">
                {fmtRate(r.engagementRate)}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-ink">{fmtCell(r.views)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-ink">{fmtCell(r.likes)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-ink">{fmtCell(r.saves)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-ink">{fmtCell(r.shares)}</td>
              <td className="px-3 py-3 text-xs text-ink-soft">
                {r.postedAt ? r.postedAt.slice(0, 10) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
