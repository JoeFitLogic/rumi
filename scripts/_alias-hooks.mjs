// Resolve hook for node-run harnesses that import real app modules:
//   * `server-only`  → empty module (so server-only files import cleanly)
//   * `@/x`          → <repo>/src/x(.ts|.tsx|/index.ts)  (mirrors tsconfig paths)
// Touches nothing in the repo or node_modules.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = new URL("../src/", import.meta.url);

export async function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    return { url: new URL("./_empty.mjs", import.meta.url).href, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const base = new URL(specifier.slice(2), SRC);
    for (const cand of [base.href, `${base.href}.ts`, `${base.href}.tsx`, `${base.href}/index.ts`]) {
      if (existsSync(fileURLToPath(cand))) return { url: cand, shortCircuit: true };
    }
    return { url: `${base.href}.ts`, shortCircuit: true };
  }
  return next(specifier, context);
}
