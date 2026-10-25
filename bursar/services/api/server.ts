// Bursar API. `pnpm api` from the repo root. People data comes from the captured sandbox responses, or live from the
// CRS sandbox when CRS_LIVE=1 and CRS_USERNAME / CRS_PASSWORD are set (server-side only; never sent to the browser).
// DEMO (default true) picks who negotiates: the deterministic rule-based stand-ins, or with DEMO=false the LLM agents
// in agents/real (needs ANTHROPIC_API_KEY; FAST_MODEL and SMART_MODEL optional). Both emit the same events, and
// nothing the browser receives says which mode is running. bursar/.env is read if present; the shell's env wins.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { dealRoutes, type DealRunner } from "./routes/deals/routes.ts";
import { liveCrs } from "./negotiation/live/liveCrs.ts";
import { llmFromEnv, runRealNegotiation } from "./agents/real/index.ts";

const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const app = Fastify({ logger: { level: "info" } });
await app.register(cors, { origin: true });
const live = process.env.CRS_LIVE === "1" && process.env.CRS_USERNAME && process.env.CRS_PASSWORD;
const crs = live ? liveCrs({ username: process.env.CRS_USERNAME!, password: process.env.CRS_PASSWORD!, log: (m) => app.log.info(m) }) : undefined;
app.log.info(live ? "CRS people data: live sandbox calls, cached per run." : "CRS people data: captured sandbox responses (set CRS_LIVE=1 for live calls).");

const demo = !["false", "0"].includes((process.env.DEMO ?? "true").trim().toLowerCase());
let run: DealRunner | undefined;
if (demo) app.log.info("Negotiators: rule-based stand-ins (DEMO=true).");
else {
  if (!process.env.ANTHROPIC_API_KEY) {
    app.log.error("DEMO=false runs the LLM agents and needs ANTHROPIC_API_KEY. Set it, or unset DEMO for the stand-ins.");
    process.exit(1);
  }
  const llm = llmFromEnv((c) => (c.ok ? app.log.info : app.log.warn).call(app.log,
    `${c.agent} (${c.model}) ${c.ok ? "ok" : "failed"} in ${c.ms} ms${c.attempts > 1 ? ` after ${c.attempts} tries` : ""}${c.problems.length ? `: ${c.problems.join("; ")}` : ""}`));
  run = (rb, o) => runRealNegotiation(rb, { ...o, llm, log: (m) => app.log.warn(m) });
  app.log.info(`Negotiators: LLM agents (DEMO=false), fast ${llm.fastModel}, smart ${llm.smartModel}.`);
}

await app.register(dealRoutes, { crs, run });
app.get("/health", async () => ({ ok: true, crs: live ? "live" : "cached" }));

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: "0.0.0.0" });
