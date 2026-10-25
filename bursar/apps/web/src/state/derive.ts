// Fold the events played so far into what The Table shows. Pure: same events in, same table out.

import type { Ask, BusinessSummary, Card, ClaimCheck, CrsLogEntry, DealEvent, DealStatus, Exhibit, Offer, RiskTier, RuleId, Rulebook,
  SubProfile, TierCaps, UploadedW9 } from "@terms-room/shared";

export interface PlayedCard { card: Card; trust: number; at: number; slot: number }
export interface PlayedOffer { offer: Offer; rejected: boolean; reasons: string[]; at: number; index: number }
export interface PlayedExhibit { exhibit: Exhibit; at: number; index: number; checks: ClaimCheck[] }
export interface PlayedCheck { check: ClaimCheck; at: number }
export interface AppliedRule { ruleId: RuleId; text: string; round: number; at: number }

export interface TableState {
  negotiationId?: string;
  rulebook?: Rulebook;
  business?: BusinessSummary;
  sub?: SubProfile;
  ask?: Ask;
  contractor?: string;
  status: DealStatus | "idle";
  chapter?: { n: number; title: string; caption: string; at: number };
  tier?: { tier: RiskTier; reason: string; limits: TierCaps; at: number };
  trust: number;
  cards: PlayedCard[];
  exhibits: PlayedExhibit[];
  checks: PlayedCheck[];
  rules: AppliedRule[];
  upload?: { round: number; prompt: string; draft: UploadedW9; at: number } | null; // waiting for the judge
  report?: { callId: string | null; reason: string; at: number };
  offers: PlayedOffer[];
  lastMade: { contractor?: Offer; sub?: Offer };
  current?: Offer;
  round: number;
  closed?: { terms: Offer; rounds: number; depositCents: number; approversNeeded: number; at: number };
  ended?: { round: number; reasons: string[]; ruleIds: RuleId[]; at: number };
  escalated?: { round: number; reason: string; at: number };
  approved?: { approvers: string[]; at: number };
  deposit?: { transferId: string; amountCents: number; simulated: boolean; at: number };
  log: CrsLogEntry[];
  actor?: "contractor" | "sub"; // who acted in the latest event
  lastEventAt: number;
}

export const EMPTY: TableState = { status: "idle", trust: 50, cards: [], exhibits: [], checks: [], rules: [], offers: [], lastMade: {}, round: 0, log: [], lastEventAt: 0 };

/** times[i] is when event i was played (performance.now ms), so the scene can animate from it. */
export function derive(events: DealEvent[], played: number, times: number[]): TableState {
  const s: TableState = { ...EMPTY, cards: [], exhibits: [], checks: [], rules: [], offers: [], lastMade: {}, log: [] };
  const slots = { contractor: 0, sub: 0 };
  for (let i = 0; i < played && i < events.length; i++) {
    const e = events[i];
    const at = times[i] ?? 0;
    s.lastEventAt = at;
    switch (e.type) {
      case "negotiation_started":
        Object.assign(s, { negotiationId: e.negotiationId, rulebook: e.rulebook, business: e.business, sub: e.sub, ask: e.ask, contractor: e.contractor, status: "negotiating", round: 1 });
        s.actor = "sub";
        break;
      case "chapter":
        s.chapter = { n: e.n, title: e.title, caption: e.caption, at };
        break;
      case "exhibit_played":
        s.exhibits.push({ exhibit: e.exhibit, at, index: s.exhibits.length, checks: [] });
        s.upload = null;
        s.actor = "sub";
        break;
      case "upload_requested":
        s.upload = { round: e.round, prompt: e.prompt, draft: e.draft, at };
        break;
      case "claim_checked": {
        s.checks.push({ check: e.check, at });
        s.exhibits.find((x) => x.exhibit.id === e.check.exhibitId)?.checks.push(e.check);
        s.trust = e.check.trust;
        s.actor = "contractor";
        break;
      }
      case "rule_applied":
        s.rules.push({ ruleId: e.ruleId, text: e.text, round: e.round, at });
        break;
      case "crs_call":
        s.log.push(e.entry);
        s.actor = e.entry.side;
        break;
      case "card_landed":
        s.cards.push({ card: e.card, trust: e.trust, at, slot: slots[e.card.side]++ });
        s.actor = e.card.side;
        break;
      case "report_held":
        s.report = { callId: e.callId, reason: e.reason, at };
        s.actor = "sub";
        break;
      case "tier_changed":
        s.tier = { tier: e.tier, reason: e.reason, limits: e.limits, at };
        s.actor = "contractor";
        break;
      case "offer_made":
        s.offers.push({ offer: e.offer, rejected: false, reasons: [], at, index: s.offers.length });
        s.lastMade[e.offer.from] = e.offer;
        s.current = e.offer;
        s.round = e.offer.round;
        s.actor = e.offer.from;
        break;
      case "offer_rejected":
        s.offers.push({ offer: e.offer, rejected: true, reasons: e.reasons, at, index: s.offers.length });
        s.actor = e.offer.from;
        break;
      case "deal_closed":
        s.closed = { terms: e.terms, rounds: e.rounds, depositCents: e.depositCents, approversNeeded: e.approversNeeded, at };
        s.status = "agreed";
        break;
      case "talks_ended":
        s.ended = { round: e.round, reasons: e.reasons, ruleIds: e.ruleIds, at };
        s.status = "ended";
        break;
      case "escalated":
        s.escalated = { round: e.round, reason: e.reason, at };
        s.status = "escalated";
        break;
      case "approved":
        s.approved = { approvers: e.approvers, at };
        s.status = "approved";
        break;
      case "deposit_paid":
        s.deposit = { transferId: e.transferId, amountCents: e.amountCents, simulated: e.simulated, at };
        s.status = "deposit_paid";
        break;
    }
  }
  return s;
}

/** How long to hold on each event before playing the next one, at 1× speed. */
export const HOLD_MS: Record<DealEvent["type"], number> = {
  negotiation_started: 1800,
  chapter: 2400,
  exhibit_played: 3400,
  upload_requested: 600,
  crs_call: 600,
  card_landed: 1100,
  claim_checked: 1900,
  rule_applied: 2600,
  report_held: 1400,
  tier_changed: 1500,
  offer_made: 3200,
  offer_rejected: 3600,
  deal_closed: 3800,
  talks_ended: 3800,
  escalated: 3300,
  approved: 2000,
  deposit_paid: 2200,
};

/** Index of the first event of each chapter, for the chapter strip. */
export function chapterStarts(events: DealEvent[]) {
  const out: { n: number; title: string; index: number }[] = [];
  events.forEach((e, i) => { if (e.type === "chapter") out.push({ n: e.n, title: e.title, index: i }); });
  return out;
}
