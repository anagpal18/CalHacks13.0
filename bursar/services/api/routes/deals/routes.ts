// Deal API + live event stream.
//   POST /deals                 start: { scenario, buyerRules, vendorRules, general }  -> { negotiationId, rulebook }
//   GET  /deals/:id             full deal with the rulebook, rounds, cards, CRS log and events
//   POST /deals/:id/exhibit     the judge's W-9 (its fields only; the file stays in the browser), or { w9: null } to skip
//   POST /deals/:id/approve     controller approval                    -> { events }
//   GET  /deals/:id/stream      SSE: every event so far, then live ones, in the order The Table plays them
//   POST /deals/:id/bluff       the vendor cites a value CRS never returned; the gateway's verdict is streamed
// The rulebook is normalized (clamped to the start page's ranges) before the engine sees it, and the gateway
// enforces it in code. Deals live in memory; restart the server and they're gone.

import type { FastifyInstance, FastifyReply } from "fastify";
import type { DealEvent, Rulebook, UploadedW9 } from "@terms-room/shared";
import { approveDeal, bluff, normalizeRulebook, runNegotiation, type CrsSource, type Negotiation } from "../../negotiation/index.ts";

interface Entry {
  n: Negotiation | null;
  rulebook: Rulebook;
  events: DealEvent[];
  listeners: Set<(e: DealEvent) => void>;
  error?: string;
  pendingUpload?: (w9: UploadedW9 | null) => void;
}

const field = (v: unknown) => (typeof v === "string" ? v.slice(0, 200).trim() : "");

export async function dealRoutes(app: FastifyInstance, opts: { crs?: CrsSource } = {}) {
  const deals = new Map<string, Entry>();
  const push = (entry: Entry, e: DealEvent) => { entry.events.push(e); entry.listeners.forEach((l) => l(e)); };

  app.post<{ Body: Partial<Rulebook> }>("/deals", async (req, reply) => {
    const body = req.body ?? {};
    if (!body.scenario?.id) return reply.code(400).send({ error: "Send { scenario, buyerRules, vendorRules, general }; scenario.id is one of A, B, C, D, E." });
    const rulebook = normalizeRulebook(body);
    const negotiationId = `neg_${rulebook.scenario.id}_${rulebook.scenario.owner}_${Date.now().toString(36)}`;
    const entry: Entry = { n: null, rulebook, events: [], listeners: new Set() };
    deals.set(negotiationId, entry);
    const judge = () => new Promise<UploadedW9 | null>((resolve) => {
      const timer = setTimeout(() => { entry.pendingUpload = undefined; resolve(null); }, 10 * 60_000);
      entry.pendingUpload = (w9) => { clearTimeout(timer); entry.pendingUpload = undefined; resolve(w9); };
    });
    runNegotiation(rulebook, { negotiationId, crs: opts.crs, judge, emit: (e) => push(entry, e) })
      .then((n) => { entry.n = n; })
      .catch((err: Error) => { entry.error = err.message; });
    return reply.code(201).send({ negotiationId, rulebook });
  });

  app.get<{ Params: { id: string } }>("/deals/:id", async (req, reply) => {
    const entry = deals.get(req.params.id);
    if (!entry) return reply.code(404).send({ error: "No deal with that id." });
    const n = entry.n;
    return { rulebook: entry.rulebook, deal: n?.deal ?? null, sub: n?.sub ?? null, cards: n?.cards ?? [],
      crsLog: entry.events.flatMap((e) => (e.type === "crs_call" ? [e.entry] : [])), events: entry.events, error: entry.error ?? null };
  });

  app.post<{ Params: { id: string }; Body: { w9?: Partial<UploadedW9> | null } }>("/deals/:id/exhibit", async (req, reply) => {
    const entry = deals.get(req.params.id);
    if (!entry) return reply.code(404).send({ error: "No deal with that id." });
    if (!entry.pendingUpload) return reply.code(409).send({ error: "This deal isn't waiting for a document." });
    const w = req.body?.w9;
    entry.pendingUpload(w ? { legalName: field(w.legalName), ein: field(w.ein), address: field(w.address), signer: field(w.signer), fileName: field(w.fileName) || undefined } : null);
    return { ok: true };
  });

  app.post<{ Params: { id: string }; Body: { approvers?: string[] } }>("/deals/:id/approve", async (req, reply) => {
    const entry = deals.get(req.params.id);
    if (!entry?.n) return reply.code(404).send({ error: "No finished deal with that id." });
    try {
      const out = approveDeal(entry.n, req.body?.approvers ?? []);
      out.forEach((e) => push(entry, e));
      return { events: out };
    } catch (err) {
      return reply.code(409).send({ error: (err as Error).message });
    }
  });

  app.post<{ Params: { id: string } }>("/deals/:id/bluff", async (req, reply) => {
    const entry = deals.get(req.params.id);
    if (!entry?.n) return reply.code(404).send({ error: "No finished deal with that id." });
    const e = bluff(entry.n);
    push(entry, e);
    return { event: e };
  });

  app.get<{ Params: { id: string } }>("/deals/:id/stream", (req, reply: FastifyReply) => {
    const entry = deals.get(req.params.id);
    if (!entry) { reply.code(404).send({ error: "No deal with that id." }); return; }
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    const send = (e: DealEvent) => reply.raw.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
    entry.events.forEach(send);
    entry.listeners.add(send);
    const ping = setInterval(() => reply.raw.write(": ping\n\n"), 15_000);
    req.raw.on("close", () => { clearInterval(ping); entry.listeners.delete(send); });
  });
}
