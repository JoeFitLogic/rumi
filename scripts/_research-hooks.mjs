// Resolve hook: alias the bare `server-only` marker import to an empty module so
// the REAL src/lib/research/apify.ts (which does `import "server-only"`) can be
// imported into a plain-node harness. Touches nothing in the repo or node_modules.
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") {
    return { url: new URL("./_empty.mjs", import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
