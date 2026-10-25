// STAND-IN for Kenil's CRS client (services/api/integrations/crs, `POST /crs/:product`).
// Serves the real sandbox responses captured in fixtures/crs_fixtures.json (SSNs masked at rest). Like the real
// client it is an allowlist: anything that isn't a captured persona call throws instead of reaching a vendor.
// These are LIVE CRS people data replayed from the call cache, so every record says cached: true.

import type { CrsCallProduct, CrsCallRecord } from "@terms-room/shared";
import fixtures from "../fixtures/crs_fixtures.json";

export type PeopleProduct = Exclude<CrsCallProduct, `biz_${string}`>;

export interface CrsSource {
  call(product: PeopleProduct, persona: string, purpose: string, side: "contractor" | "sub"): Promise<CrsCallRecord>;
}

export function fixtureCall(product: PeopleProduct, persona: string) {
  return fixtures.calls.find((c) => c.product === product && c.persona === persona);
}

export function fixtureCrs(): CrsSource {
  return {
    async call(product, persona, purpose, side) {
      const hit = fixtureCall(product, persona);
      if (!hit) throw new Error(`No sandbox persona response for ${product} / ${persona}. Only allowlisted persona calls are made.`);
      return {
        callId: hit.callId, product, persona, purpose, side, source: "live", method: hit.method, path: hit.path,
        status: hit.status, latencyMs: hit.latencyMs, at: hit.at, cached: true, response: hit.response,
      };
    },
  };
}
