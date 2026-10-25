// Bursar API. Runs the negotiation engine with the stand-in agents and gateway until Kenil's services replace them.
// `pnpm api` from the repo root. People data comes from the captured sandbox responses, or live from the CRS
// sandbox when CRS_LIVE=1 and CRS_USERNAME / CRS_PASSWORD are set (server-side only; never sent to the browser).

import Fastify from "fastify";
import cors from "@fastify/cors";
import { dealRoutes } from "./routes/deals/routes.ts";
import { liveCrs } from "./negotiation/live/liveCrs.ts";

const app = Fastify({ logger: { level: "info" } });
await app.register(cors, { origin: true });
const live = process.env.CRS_LIVE === "1" && process.env.CRS_USERNAME && process.env.CRS_PASSWORD;
const crs = live ? liveCrs({ username: process.env.CRS_USERNAME!, password: process.env.CRS_PASSWORD!, log: (m) => app.log.info(m) }) : undefined;
app.log.info(live ? "CRS people data: live sandbox calls, cached per run." : "CRS people data: captured sandbox responses (set CRS_LIVE=1 for live calls).");
await app.register(dealRoutes, { crs });
app.get("/health", async () => ({ ok: true, crs: live ? "live" : "cached" }));

const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: "0.0.0.0" });
