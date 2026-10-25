// EVIDENCE_RISK_JUDGE (smart model): one verdict per claim against what CRS returned, a look-alike call, and a
// proposed risk tier. The tier is only a proposal; the orchestrator clamps it with the Rulebook's hard stops in code.

import { z } from "zod";
import type { CrsCallRecord } from "@terms-room/shared";
import { callAgent, type Llm } from "./llm.ts";
import { citation, citationProblems, sentence, thoughtField, uiWordProblems, PLAIN_WORDS, type AgentCitation } from "./contracts.ts";

export const judgment = z.object({
  verdicts: z.array(z.object({
    claimId: z.string(),
    verdict: z.enum(["VERIFIED", "CONTRADICTED", "UNVERIFIED"]),
    reason: sentence(20),
    citation: citation.nullable(),
  })),
  lookalike: z.object({ isLookalike: z.boolean(), matchedCompany: z.string().nullable(), reasons: z.array(z.string()) }),
  proposedTier: z.enum(["low", "caution", "blocked"]),
  topReasons: z.array(z.object({ reason: sentence(15), citation })).min(1).max(3),
  thought: thoughtField("your reaction to these verdicts as Keystone's examiner: first person, conversational"),
});
export type Judgment = z.infer<typeof judgment>;

export interface ClaimWithCrs { claimId: string; field: string; claimValue: string; crsValue: string | null; citation: AgentCitation | null }
export interface JudgeInput { claimsWithCrs: ClaimWithCrs[]; quickSearchResults: unknown; personCrsSummary: unknown; businessCrsSummary: unknown }

const SYSTEM = `You are Bursar's Evidence & Risk Judge. A vendor wants payment terms from Keystone Bay Builders, a general contractor. Each claim the vendor made comes with what CRS returned for it. Rule on every claim and propose a risk tier.

Verdicts, exactly one per claimId in claimsWithCrs:
- VERIFIED: the CRS value supports the claim.
- CONTRADICTED: the CRS value conflicts with it: a different name or owner, a non-match indicator (false), a later registration date than claimed, records on file, a failed identity check.
- UNVERIFIED: CRS has nothing that tests it (crsValue is null) or the data doesn't settle it.
reason is one plain sentence a controller can read. citation is copied exactly from the claim ({callId, field, value}) or from the summaries; it is null only for an UNVERIFIED claim with no source.

lookalike.isLookalike is true when Quick Search shows an older, established business with nearly the same name, or the vendor's documents borrow another business's name, EIN or address. matchedCompany is that business's name, else null.

proposedTier:
- blocked: failed identity, a look-alike, an OFAC match, an inactive business, no business credit history, or a mismatched EIN, address or phone.
- caution: liens, judgments or bankruptcies, paying more than 15 days beyond terms, many UCC filings, a medium Intelliscore, or a business registered less than two years ago.
- low: otherwise.
topReasons: one to three decisive reasons, each with a citation copied from the input.
thought: your reaction to these verdicts, as the buyer's examiner thinking aloud at the table: first person, conversational, about 20 words, naming what matters most.

${PLAIN_WORDS}

Never invent callIds, fields or values. Answer by calling the record_judgment tool exactly once.`;

function problems(out: Judgment, input: JudgeInput, log: CrsCallRecord[]): string[] {
  const want = input.claimsWithCrs.map((c) => c.claimId);
  const got = out.verdicts.map((v) => v.claimId);
  const p: string[] = [];
  const missing = want.filter((id) => !got.includes(id));
  const extra = got.filter((id) => !want.includes(id));
  const twice = got.filter((id, i) => got.indexOf(id) !== i);
  if (missing.length) p.push(`no verdict for ${missing.join(", ")}`);
  if (extra.length) p.push(`verdicts for unknown claimIds ${extra.join(", ")}`);
  if (twice.length) p.push(`more than one verdict for ${[...new Set(twice)].join(", ")}`);
  for (const v of out.verdicts) if (v.verdict !== "UNVERIFIED" && !v.citation) p.push(`${v.claimId} is ${v.verdict} but cites nothing`);
  p.push(...citationProblems(out.verdicts.map((v) => v.citation), log, "verdict citation"));
  p.push(...citationProblems(out.topReasons.map((r) => r.citation), log, "topReasons citation"));
  p.push(...uiWordProblems({ thought: out.thought }));
  return p;
}

export function judge(llm: Llm, input: JudgeInput, log: CrsCallRecord[]): Promise<Judgment> {
  return callAgent(llm, {
    agent: "EVIDENCE_RISK_JUDGE", model: "smart", system: SYSTEM,
    tool: { name: "record_judgment", description: "Record the verdicts, the look-alike call and the proposed tier." },
    schema: judgment, input, check: (out) => problems(out, input, log), maxTokens: 4096,
  });
}
