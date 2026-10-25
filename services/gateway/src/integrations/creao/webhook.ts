// Creao webhook intake. Creao webhooks are not signed, retry up to 3 times and expect a 2xx
// within 10 seconds. So: check our URL token, drop duplicates, and trust only a fresh GET of the run.
import { timingSafeEqual } from "node:crypto";
import type { CreaoClient, CreaoRun } from "./client.ts";

export interface WebhookRequest {
  query: Record<string, string | undefined>;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createWebhookHandler(client: CreaoClient, opts: { token: string }) {
  // In-memory is enough for the hackathon; a restart may let one duplicate through.
  const seen = new Set<string>();

  // Reply 2xx to Creao first, then await this. Returns null for ignored deliveries.
  return async function handle(req: WebhookRequest): Promise<CreaoRun | null> {
    if (!sameToken(req.query.token ?? "", opts.token)) return null;
    const runId: unknown = req.body?.runId;
    if (typeof runId !== "string" || seen.has(runId)) return null;
    seen.add(runId);
    return client.getRun(runId);
  };
}
