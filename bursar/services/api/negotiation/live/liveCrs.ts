// Live CRS sandbox client, server-side only. Opt in with CRS_LIVE=1 plus CRS_USERNAME / CRS_PASSWORD in the API's env.
//   - One login; the token stays in memory. A failed login is never retried (repeated failures lock the account).
//   - Allowlist: it sends only the persona-exact request bodies in fixtures/crs_requests.json. Anything else throws.
//   - Cache: one sandbox call per (product, persona) per server run; repeats are served from memory and say cached.
//   - Any failure falls back to the captured fixture response, so the demo never breaks on the network.
// Headers and tokens are never logged, stored or returned; responses are masked (SSN/EIN to the last 4) before use.

import { maskDeep, type CrsCallRecord } from "@terms-room/shared";
import requests from "../fixtures/crs_requests.json";
import { fixtureCrs, type CrsSource, type PeopleProduct } from "../standins/fixtureCrs.ts";

export interface LiveOptions { baseUrl?: string; username: string; password: string; log?: (msg: string) => void }

export function liveCrs(o: LiveOptions): CrsSource {
  const base = (o.baseUrl ?? "https://api-sandbox.stitchcredit.com/api").replace(/\/$/, "");
  const log = o.log ?? (() => {});
  const fallback = fixtureCrs();
  const cache = new Map<string, CrsCallRecord>();
  let token: { value: string; expires: number } | null = null;
  let login: Promise<string | null> | null = null;
  let loginFailed = false;

  async function bearer(): Promise<string | null> {
    if (token && token.expires > Date.now() + 30_000) return token.value;
    if (loginFailed) return null;
    login ??= (async () => {
      try {
        const r = await fetch(`${base}/users/login`, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ username: o.username, password: o.password }) });
        if (!r.ok) { loginFailed = true; log(`CRS login refused (HTTP ${r.status}). Not retrying; serving cached sandbox responses.`); return null; }
        const body = (await r.json()) as { token?: string; expires?: number };
        if (!body.token) { loginFailed = true; log("CRS login returned no token. Serving cached sandbox responses."); return null; }
        token = { value: body.token, expires: Date.now() + (body.expires ?? 3600) * 1000 };
        log("CRS login OK. Live sandbox calls on.");
        return token.value;
      } catch {
        loginFailed = true; log("CRS login failed (network). Serving cached sandbox responses."); return null;
      } finally { login = null; }
    })();
    return login;
  }

  return {
    async call(product: PeopleProduct, persona, purpose, side) {
      const req = requests.calls.find((c) => c.product === product && c.persona === persona);
      if (!req) throw new Error(`No persona-exact request body for ${product} / ${persona}. Only allowlisted persona calls are made.`);
      const key = `${product}|${persona}`;
      const hit = cache.get(key);
      if (hit) return { ...hit, purpose, side, cached: true };
      const t = await bearer();
      if (!t) return fallback.call(product, persona, purpose, side);
      const started = performance.now();
      try {
        const r = await fetch(`${base}${req.path}`, { method: req.method, headers: { "content-type": "application/json", accept: "application/json", authorization: `Bearer ${t}` },
          body: JSON.stringify(req.body) });
        const latencyMs = Math.round(performance.now() - started);
        const callId = r.headers.get("RequestID") ?? `live-${Date.now().toString(36)}`;
        if (!r.ok) { log(`CRS ${product} for ${persona} answered HTTP ${r.status}; using the cached response.`); return fallback.call(product, persona, purpose, side); }
        const response = maskDeep(await r.json());
        const rec: CrsCallRecord = { callId, product, persona, purpose, side, source: "live", method: req.method, path: req.path,
          status: r.status, latencyMs, at: new Date().toISOString(), cached: false, response };
        cache.set(key, rec);
        return rec;
      } catch {
        log(`CRS ${product} for ${persona} failed (network); using the cached response.`);
        return fallback.call(product, persona, purpose, side);
      }
    },
  };
}
