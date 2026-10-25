// SIMULATED business products in CRS format. The CalHacks sandbox has no business, SOS, UCC or OFAC routes
// (crs_sandbox_inventory.md §1), so these answer from the scenario's BusinessRecord, shaped after the Experian
// Business products CRS resells (EXPERIAN_BUSINESS_SEARCH, PREMIER_PROFILE, INTELLISCORE). The README says so,
// and every record carries source: "simulated" internally (not shown in the UI, by request). Nothing here leaves the server.

import type { CrsCallProduct, CrsCallRecord } from "@terms-room/shared";
import { incorporatedOn, type BusinessRecord } from "./scenarios.ts";

export type BizProduct = Extract<CrsCallProduct, `biz_${string}`>;

export interface BizInput { legalName?: string; ein?: string; address?: string; phone?: string }

export interface BizSource {
  call(product: BizProduct, record: BusinessRecord, purpose: string, input?: BizInput): Promise<CrsCallRecord>;
}

const PATH: Record<BizProduct, string> = {
  biz_quick_search: "/experian/business/v1/search",
  biz_registration: "/experian/business/v1/corporate-registrations",
  biz_fraud_shields: "/experian/business/v1/fraud-shields",
  biz_risk_dashboard: "/experian/business/v1/risk-dashboards",
};

export const SIMULATED_NOTE = "SIMULATED IN CRS FORMAT. The CalHacks sandbox has no business products; this record is made up for the demo.";

const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const hex = (n: number, len: number) => n.toString(16).padStart(len, "0").slice(-len);
const callId = (seed: string) => { const a = hash(seed), b = hash(seed + "b"), c = hash(seed + "c"), d = hash(seed + "d"); return `${hex(a, 8)}-${hex(b, 4)}-4${hex(c, 3)}-${hex(d, 4)}-${hex(a ^ d, 8)}${hex(b ^ c, 4)}`; };
const norm = (s = "") => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const header = (r: BusinessRecord) => ({
  bin: r.bin, businessName: r.legalName, phone: `+1${r.phone}`, taxId: r.ein,
  address: { street: r.address.street, city: r.address.city, state: r.address.state, zip: r.address.zip },
});

export function bizResponse(product: BizProduct, r: BusinessRecord, now: Date, input: BizInput = {}): unknown {
  const requestId = callId(`${product}|${r.bin}|${input.ein ?? ""}|${input.address ?? ""}`);
  const base = { requestId, success: true };
  const inc = incorporatedOn(r, now);
  switch (product) {
    case "biz_quick_search": {
      const self = { ...header(r), taxId: undefined, reliabilityCode: 98.4, numberOfTradelines: r.tradelines, financialStatementIndicator: false,
        keyFactsIndicator: true, inquiryIndicator: r.tradelines > 0, bankDataIndicator: false, governmentDataIndicator: false,
        executiveSummaryIndicator: r.tradelines > 0, uccIndicator: r.ucc.count > 0, yearOfIncorporation: inc.slice(0, 4) };
      const results: unknown[] = [self];
      if (r.lookAlike) results.push({ bin: r.lookAlike.bin, businessName: r.lookAlike.legalName, reliabilityCode: 96.1,
        address: r.lookAlike.address, numberOfTradelines: r.lookAlike.tradelines, yearOfIncorporation: r.lookAlike.incorporated.slice(0, 4),
        keyFactsIndicator: true, executiveSummaryIndicator: true, uccIndicator: true,
        matchingNameIndicator: true, nameSimilarityScore: 97 });
      return { ...base, results, lookAlikeIndicator: !!r.lookAlike };
    }
    case "biz_registration":
      return { ...base, results: { businessHeader: header(r), corporateRegistration: {
        stateOfOrigin: r.stateOfOrigin, originalFilingDate: inc, incorporatedDate: inc, recentFilingDate: inc,
        businessType: r.businessType, statusFlag: r.status === "ACTIVE" ? "A" : "I", statusDescription: r.status,
        charterNumber: `${r.stateOfOrigin}${inc.replace(/-/g, "").slice(0, 6)}${r.bin.slice(-4)}`,
        officers: r.officers.map((o) => ({ name: o.name, title: o.title })),
        registeredAgent: { name: "REGISTERED AGENTS INC", city: r.address.city, state: r.address.state } } } };
    case "biz_fraud_shields": {
      const tin = input.ein ? input.ein.replace(/\D/g, "") : null;
      const addressIn = input.address ? norm(input.address.split(",")[0]) : null;
      return { ...base, results: { businessHeader: header(r), inputs: { taxId: tin, address: input.address ?? null },
        fraudShields: {
          activeBusinessIndicator: r.status === "ACTIVE",
          ofacMatchWarning: !!r.ofac, ofacMatchCode: r.ofac?.matchCode ?? "1", ofacMatchDescription: r.ofac?.description ?? "No match",
          businessVictimStatementIndicator: r.victimStatement,
          taxIdMatchIndicator: tin === null ? null : tin === r.ein,
          addressMatchIndicator: addressIn === null ? null : addressIn === norm(r.address.street),
          matchingBusinessIndicator: !!r.lookAlike,
          businessRiskTriggersIndicator: !!r.ofac || !!r.lookAlike || r.victimStatement,
        } } };
    }
    case "biz_risk_dashboard":
      return { ...base, results: { businessHeader: header(r),
        intelliscore: r.intelliscore ? { modelCode: "000224", modelTitle: "INTELLISCORE PLUS V2", score: r.intelliscore.score,
          percentileRanking: r.intelliscore.percentile, riskClass: { code: r.intelliscore.riskClass, definition: r.intelliscore.riskDefinition } } : null,
        creditLimitRecommendation: { recommendedCreditLimitAmount: r.recommendedLimitCents === null ? null : r.recommendedLimitCents / 100 },
        paymentPerformance: { currentDbt: r.dbt.current, monthlyAverageDbt: r.dbt.monthlyAverage, highestDbt6Months: r.dbt.highest6Months, tradelineCount: r.tradelines },
        derogatory: { taxLienCount: r.derogatory.taxLiens, judgmentCount: r.derogatory.judgments, collectionCount: r.derogatory.collections, bankruptcyIndicator: r.derogatory.bankruptcy },
        uccFilings: { count: r.ucc.count, cautionaryUccIndicator: r.ucc.cautionary },
        yearsInBusiness: Math.max(0, Math.floor((now.getTime() - Date.parse(inc)) / (365.25 * 86_400_000))) } };
  }
}

/** The simulated source: deterministic latency and IDs, so replays and tests repeat exactly. */
export function simulatedBiz(now: () => Date = () => new Date()): BizSource {
  return {
    async call(product, record, purpose, input) {
      const response = bizResponse(product, record, now(), input) as { requestId: string };
      return { callId: response.requestId, product, persona: record.bin, purpose, side: "contractor", source: "simulated",
        method: "POST", path: PATH[product], status: 200, latencyMs: 160 + (hash(response.requestId) % 260), at: now().toISOString(),
        cached: false, response };
    },
  };
}
