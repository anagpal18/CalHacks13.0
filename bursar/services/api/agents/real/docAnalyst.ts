// DOC_ANALYST (fast model): the checkable claims a vendor document states, each mapped to the CRS product and field
// that can test it. Built-in documents are cached by their text for the life of the server; the judge's W-9 runs live.

import { z } from "zod";
import { callAgent, type Llm } from "./llm.ts";

export const CLAIM_FIELDS = ["legal_name", "ein", "address", "standing", "pays_on_time", "volume", "bank_balance"] as const;

export const docAnalysis = z.object({
  docType: z.string(),
  claims: z.array(z.object({
    claimId: z.string().describe("short and stable, e.g. legal_name"),
    field: z.enum(CLAIM_FIELDS),
    value: z.string().describe("the claimed value exactly as printed; a full nine-digit EIN, never masked"),
    sourceText: z.string().describe("the exact words of the document the claim comes from"),
    check: z.object({ product: z.string(), crsField: z.string() }).nullable().describe("null when no listed product can test the claim"),
  })),
  error: z.string().nullable(),
});
export type DocAnalysis = z.infer<typeof docAnalysis>;

export interface DocInput { docType: string; text: string; availableProducts: { product: string; fields: string[] }[] }

const SYSTEM = `You are Bursar's Doc Analyst. A vendor hands a document to a construction company's accounts-payable team. List every factual claim the document explicitly states that CRS business data could confirm or refute, and say which product and field tests it.

Rules:
- Only claims the document states in so many words. Never infer: no state of incorporation from a mailing address, no dates the document doesn't print.
- field is the kind of claim: legal_name (the registered business name), ein (employer identification number), address (the business address), standing (licensed or in business since a year, or active status), pays_on_time (pays suppliers within terms), volume (past work or sales), bank_balance (bank balances).
- value is the claimed value exactly as printed. Keep the full EIN with all nine digits; never mask it.
- sourceText is the exact words from the document that the claim comes from.
- check names a product and crsField from availableProducts only. If no listed product can test the claim, check is null.
- One claim per fact. claimId is the field name, with a number added only if a field repeats.
- If the text is not the document type it says it is, or can't be read, return no claims and explain in error; otherwise error is null.

Answer by calling the record_claims tool exactly once.`;

const tokens = (s: string) => s.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
const digits = (s: string) => s.replace(/\D/g, "");

function problems(out: DocAnalysis, input: DocInput): string[] {
  const p: string[] = [];
  // Every word of a value or quote has to be printed in the document; an address may join the lines it's printed on.
  const printed = new Set(tokens(input.text));
  const stated = (s: string) => tokens(s).length > 0 && tokens(s).every((t) => printed.has(t));
  const ids = new Set<string>();
  for (const c of out.claims) {
    if (ids.has(c.claimId)) p.push(`claimId ${c.claimId} repeats`);
    ids.add(c.claimId);
    if (c.field === "ein") {
      if (digits(c.value).length !== 9) p.push(`ein value "${c.value}" must be the full nine-digit EIN`);
      else if (!digits(input.text).includes(digits(c.value))) p.push(`ein ${c.value} isn't in the document`);
    } else if (!stated(c.value)) p.push(`${c.claimId} value "${c.value}" isn't stated in the document`);
    if (!stated(c.sourceText)) p.push(`${c.claimId} sourceText isn't quoted from the document`);
    if (c.check) {
      const prod = input.availableProducts.find((x) => x.product === c.check!.product);
      if (!prod) p.push(`${c.claimId} check.product ${c.check.product} isn't in availableProducts`);
      else if (!prod.fields.includes(c.check.crsField)) p.push(`${c.claimId} check.crsField ${c.check.crsField} isn't a field of ${prod.product}`);
    }
  }
  return p;
}

const cache = new Map<string, Promise<DocAnalysis>>();

export function analyzeDocument(llm: Llm, input: DocInput, opts: { cache: boolean }): Promise<DocAnalysis> {
  const run = () => callAgent(llm, {
    agent: "DOC_ANALYST", model: "fast", system: SYSTEM,
    tool: { name: "record_claims", description: "Record the document's checkable claims." },
    schema: docAnalysis, input, check: (out) => problems(out, input),
  });
  if (!opts.cache) return run();
  const key = JSON.stringify(input);
  let hit = cache.get(key);
  if (!hit) {
    hit = run();
    cache.set(key, hit);
    hit.catch(() => cache.delete(key));
  }
  return hit;
}
