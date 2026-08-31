import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_fimjpviuifzyvptvzmqn",
  // node-22 (not "node", which is Node 20): the Supabase client pulls in
  // realtime-js, whose WebSocket factory requires a global WebSocket — only
  // present natively from Node 22. Belt and braces with the `transport` stub
  // in src/trigger/generate-strategy.ts.
  runtime: "node-22",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./src/trigger"],
});
