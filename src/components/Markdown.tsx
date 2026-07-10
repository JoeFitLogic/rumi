"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renders strategy markdown (incl. GFM tables) in the Rumi prose style. */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-rumi">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
