// STORYTELLER_CLERK (fast model): a caption for each chapter as it starts, and the closing paperwork (terms card,
// approval memo, recommendation) when the deal ends. Plain words, nothing the events don't say.

import { z } from "zod";
import type { CrsCallRecord } from "@terms-room/shared";
import { callAgent, words, type Llm } from "./llm.ts";
import { citation, citationProblems, sentence, uiWordProblems, PLAIN_WORDS, type AgentCitation } from "./contracts.ts";

export const storyCaption = z.object({ chapter: z.number().int(), caption: sentence(22) });
export type StoryCaption = z.infer<typeof storyCaption>;

export const storyClose = z.object({
  termsCard: z.object({
    title: z.string().min(1),
    lines: z.array(z.string()).min(1).max(6),
    decidingEvidence: z.array(z.object({ fact: z.string(), citation })).max(3),
  }),
  approvalMemo: z.string().min(1).describe("50 to 70 words, never more than 80"),
  recommendation: z.enum(["approve", "do_not_approve", "needs_review"]),
});
export type StoryClose = z.infer<typeof storyClose>;

export interface CaptionInput { mode: "caption"; chapter: number; recentEvents: string[] }
export interface CloseInput {
  mode: "close";
  outcome: "agreed" | "talks_ended" | "escalated";
  finalTerms: { netDays: number; upfrontPct: number; limit: number; upfrontAmount: number; conditions: string[]; approversNeeded: number } | null;
  vendor: { business: string; trade: string; scope: string };
  owner: { persona: string; name: string };
  keyEvidence: (AgentCitation & { fact: string })[];
  rulesApplied: string[];
}

const SYSTEM = `You are Bursar's Storyteller & Clerk. Bursar shows a payment-terms negotiation between Keystone Bay Builders (the buyer) and a vendor, every claim checked against CRS credit data, in five chapters: 1 The pitch, 2 Cross-examination, 3 Risk level, 4 Negotiation, 5 Verdict.

mode "caption": write the caption for the chapter that is starting, from recentEvents. Plain words, present tense, at most 22 words, only facts in the events. Answer with the write_caption tool.

mode "close": draft the closing paperwork from the payload.
- termsCard: a short title; 3 to 5 lines stating the terms (or, if there was no deal, the outcome); decidingEvidence: up to 3 facts, each with its citation copied exactly from keyEvidence.
- approvalMemo: 50 to 70 words (never more than 80), for the controller: what was agreed or why not, the rules that shaped it, and whether a second approver is needed. Three or four short sentences.
- recommendation: "approve" when terms were agreed and no evidence contradicts them; "do_not_approve" when talks ended for cause; "needs_review" otherwise.
Answer with the write_close tool.

${PLAIN_WORDS}

Never mention simulations, demos or test data. Never invent numbers, names or citations. Call exactly one tool, once.`;

export function caption(llm: Llm, input: CaptionInput): Promise<StoryCaption> {
  return callAgent(llm, {
    agent: "STORYTELLER_CLERK", model: "fast", system: SYSTEM,
    tool: { name: "write_caption", description: "Write the caption for the chapter that is starting." },
    schema: storyCaption, input, maxTokens: 1024,
    check: (out) => [
      ...(out.chapter !== input.chapter ? [`chapter must be ${input.chapter}`] : []),
      ...uiWordProblems({ caption: out.caption }),
    ],
  });
}

export function closePaperwork(llm: Llm, input: CloseInput, log: CrsCallRecord[]): Promise<StoryClose> {
  return callAgent(llm, {
    agent: "STORYTELLER_CLERK", model: "fast", system: SYSTEM,
    tool: { name: "write_close", description: "Write the terms card, the approval memo and the recommendation." },
    schema: storyClose, input,
    check: (out) => [
      ...(words(out.approvalMemo) > 80 ? [`approvalMemo is ${words(out.approvalMemo)} words; cut it to 70 or fewer`] : []),
      ...citationProblems(out.termsCard.decidingEvidence.map((d) => d.citation), log, "decidingEvidence citation"),
      ...uiWordProblems({ paperwork: JSON.stringify(out) }),
    ],
  });
}
