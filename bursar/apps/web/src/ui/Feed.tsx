// The agents' running commentary, left of the table: what each agent thinks and what it does about it, in the order
// The Table plays them. Our agent's notes sit on the left, the vendor's on the right, chapters in between. When the
// table has caught up and someone is still working, the last note says who and for how long, so a wait never looks
// like nothing is happening.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fmtUsd, type DealEvent } from "@terms-room/shared";
import { TIER_NAME } from "@terms-room/api/negotiation";
import { useStore } from "../state/store";
import type { TableState } from "../state/derive";
import { ASKS, CHECK, PRODUCT, VERDICT, shortTerms, thought } from "./narrate";
import "./feed.css";

type Side = "contractor" | "sub";
type Tone = "good" | "warn" | "bad" | "neutral";
interface Line { text: string; tone?: Tone; quote?: boolean; crs?: boolean }
type Item =
  | { kind: "chapter"; key: string; n: number; title: string; caption: string }
  | { kind: "agent"; key: string; side: Side; role: string; thought?: string; lines: Line[]; group?: string }
  | { kind: "note"; key: string; text: string; tone: Tone | "you" };

const VERDICT_TONE: Record<string, Tone> = { verified: "good", contradicted: "bad", unverified: "neutral" };
const MARK: Record<string, string> = { verified: "✓", contradicted: "✗", unverified: "?" };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Fold the played events into notes. A run of events with the same thought (or the same kind of step) is one note. */
function notes(events: DealEvent[], played: number): Item[] {
  const items: Item[] = [];
  const say = (i: number, side: Side, role: string, th: string | undefined, lines: Line[], group?: string) => {
    const last = items.at(-1);
    if (last?.kind === "agent" && last.side === side && last.role === role && ((group && last.group === group) || (th && last.thought === th))) {
      last.lines.push(...lines);
      if (th) last.thought = th; // in a run of verdicts the newest thought is the judge's overall reaction
      return;
    }
    const prev = [...items].reverse().find((x) => x.kind === "agent");
    if (prev?.kind === "agent" && prev.thought === th) th = undefined; // the same thought twice in a row reads once
    items.push({ kind: "agent", key: `e${i}`, side, role, thought: th, lines, group });
  };
  for (let i = 0; i < played && i < events.length; i++) {
    const e = events[i];
    const own = e.thought?.text; // the agent's own words, when it gave them
    switch (e.type) {
      case "negotiation_started":
        say(i, "sub", "makes its ask", own, [{ text: `Asks to be ${shortTerms({ netDays: e.ask.netDays, depositPct: e.ask.upfrontPct, limitCents: e.ask.limitCents })}` }]);
        break;
      case "chapter":
        items.push({ kind: "chapter", key: `e${i}`, n: e.n, title: e.title, caption: e.caption });
        break;
      case "exhibit_played":
        if (e.exhibit.from === "judge") items.push({ kind: "note", key: `e${i}`, tone: "you", text: `You hand in ${e.exhibit.title}. CRS will check its ${plural(e.exhibit.claims.length, "claim")}.` });
        else say(i, "sub", "presents evidence", own, [
          { text: `${e.exhibit.kind === "statement" ? "Makes its opening statement" : `Plays ${e.exhibit.title}`} · ${plural(e.exhibit.claims.length, "claim")}` },
          { text: e.exhibit.argument, quote: true }]);
        break;
      case "upload_requested":
        items.push({ kind: "note", key: `e${i}`, tone: "you", text: "Your turn: hand in a W-9, edit what it claims, or let the vendor play its own." });
        break;
      case "crs_call":
        if (e.entry.side === "sub") say(i, "sub", "pulls its own report", own ?? thought(e)?.text, [{ text: "Its own TransUnion credit report, with its signed consent. It stays private.", crs: true }]);
        else say(i, "contractor", "checks the claims with CRS", own ?? ASKS[e.entry.product], [{ text: `Asks the ${CHECK[e.entry.product] ?? PRODUCT[e.entry.product]}`, crs: true }]);
        break;
      case "card_landed": {
        // What CRS found, in the card's plain words, under the check that found it.
        const last = items.at(-1);
        if (last?.kind === "agent" && last.side === e.card.side) last.lines.push({ text: `→ ${e.card.headline}`, tone: e.card.tone });
        break;
      }
      case "claim_checked":
        say(i, "contractor", "weighs the evidence", own && own !== e.check.reason ? own : undefined,
          [{ text: `${MARK[e.check.verdict]} ${VERDICT[e.check.verdict]}: “${e.check.text}” ${e.check.reason}`, tone: VERDICT_TONE[e.check.verdict] }], "checks");
        break;
      case "rule_applied":
        say(i, "contractor", "applies the rulebook", own, [{ text: e.text, tone: "warn" }], "rules");
        break;
      case "report_held":
        say(i, "sub", "pulls its own report", undefined, [{ text: e.reason }]);
        break;
      case "tier_changed":
        say(i, "contractor", "decides the risk level", own ?? thought(e)?.text,
          [{ text: e.limits.limitCapCents <= 0 ? `${TIER_NAME[e.tier]}: nothing can be offered` : `${TIER_NAME[e.tier]}: we pay in ${e.limits.bestNetDays} days at the soonest · up to ${e.limits.maxUpfrontPct}% up front · first order up to ${fmtUsd(e.limits.limitCapCents)}`, tone: e.tier === "low" ? "good" : e.tier === "caution" ? "warn" : "bad" }]);
        break;
      case "offer_made":
        say(i, e.offer.from, "negotiates", own, [
          { text: `${e.offer.from === "sub" ? `Asks to be ${shortTerms(e.offer)}` : `Offers to pay ${shortTerms(e.offer).replace(/^paid /, "")}`}${e.offer.conditions.length ? ` · ${e.offer.conditions.join(", ").replace(/_/g, " ")}` : ""}` },
          { text: e.offer.rationale, quote: true }]);
        break;
      case "offer_rejected":
        say(i, e.offer.from, "negotiates", undefined, [{ text: `The rule check refuses it (${shortTerms(e.offer)}): ${e.reasons[0] ?? ""}`, tone: "bad" }]);
        break;
      case "deal_closed":
        items.push({ kind: "note", key: `e${i}`, tone: "good", text: `Deal: the vendor gets paid in ${e.terms.netDays} days, ${e.terms.depositPct}% up front (${fmtUsd(e.depositCents)}), with a first order up to ${fmtUsd(e.terms.limitCents)}. ${e.approversNeeded > 1 ? "Two people approve" : "The controller approves"} before money moves.` });
        break;
      case "talks_ended":
        items.push({ kind: "note", key: `e${i}`, tone: "bad", text: `Talks end. ${e.reasons[0]?.replace(/ → talks end/, "") ?? ""}${e.reasons.length > 1 ? ` And ${plural(e.reasons.length - 1, "more rule")}.` : ""}` });
        break;
      case "escalated":
        items.push({ kind: "note", key: `e${i}`, tone: "warn", text: `Paused for a person: ${e.reason}` });
        break;
      case "approved":
        items.push({ kind: "note", key: `e${i}`, tone: "good", text: `Approved by ${e.approvers.join(" and ")}.` });
        break;
      case "deposit_paid":
        items.push({ kind: "note", key: `e${i}`, tone: "good", text: `${fmtUsd(e.amountCents)} sent up front · ${e.transferId}` });
        break;
    }
  }
  return items;
}

/** Who the table is waiting on once it has played everything that's arrived. */
function waitingOn(t: TableState, events: DealEvent[], busy: boolean): { side: Side | "you"; text: string } | null {
  if (!events.length) return busy ? { side: "contractor", text: "is setting the table" } : null;
  if (t.ended || t.escalated || t.deposit) return null;
  if (t.upload) return null; // the "Your turn" note already says so
  if (t.closed) return t.approved ? { side: "contractor", text: "is sending the up-front payment" } : { side: "you", text: "Your move: approve the deal in the panel on the right." };
  const last = events.at(-1)!;
  const chapter = t.chapter?.n ?? 1;
  if (chapter <= 2) return { side: "contractor", text: last.type === "exhibit_played" ? "is reading the document and sending its claims to CRS" : "is weighing what CRS returned" };
  if (chapter === 3) return { side: "contractor", text: "is deciding the risk level" };
  const o = t.offers.at(-1);
  if (!o) return { side: "sub", text: "is preparing its opening offer" };
  if (o.rejected) return { side: o.offer.from, text: "is reworking the offer the rule check refused" };
  return o.offer.from === "sub" ? { side: "contractor", text: "is weighing the vendor's offer" } : { side: "sub", text: "is weighing our offer" };
}

const WHO: Record<Side, string> = { contractor: "Our agent", sub: "Vendor's agent" };

export function Feed() {
  const events = useStore((s) => s.events);
  const played = useStore((s) => s.played);
  const playing = useStore((s) => s.playing);
  const busy = useStore((s) => s.busy);
  const t = useStore((s) => s.table);
  const [open, setOpen] = useState(true);
  const items = useMemo(() => notes(events, played), [events, played]);
  const wait = playing && played >= events.length ? waitingOn(t, events, busy) : null;

  // How long the current wait has lasted, ticking once a second.
  const waitKey = wait ? `${wait.side}|${wait.text}|${events.length}` : "";
  const [since, setSince] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => { setSince(Date.now()); }, [waitKey]);
  useEffect(() => {
    if (!waitKey) return;
    const id = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [waitKey]);
  const secs = waitKey ? Math.floor((Date.now() - since) / 1000) : 0;

  // Follow the newest note unless the reader has scrolled up to look back.
  const list = useRef<HTMLOListElement>(null);
  const follow = useRef(true);
  useLayoutEffect(() => {
    const el = list.current;
    if (el && follow.current) el.scrollTop = el.scrollHeight;
  }, [items, waitKey, open]);
  const onScroll = () => {
    const el = list.current;
    if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  };

  return (
    <aside className={`mind${open ? "" : " closed"}`} aria-label="What the agents are thinking">
      <div className="mind-box">
        <div className="mind-head">
          <span>Agents' thinking</span>
          <button onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide" : "Show"}</button>
        </div>
        <ol className="mind-list" ref={list} onScroll={onScroll} aria-live="polite">
          {!events.length && !busy && <li className="mind-item mind-note neutral">Press Start. Each agent's thinking shows up here as it happens.</li>}
          {items.map((it) =>
            it.kind === "chapter" ? (
              <li key={it.key} className="mind-item chapter"><b>Chapter {it.n} · {it.title}</b><span>{it.caption}</span></li>
            ) : it.kind === "note" ? (
              <li key={it.key} className={`mind-item mind-note ${it.tone}`}>{it.text}</li>
            ) : (
              <li key={it.key} className={`mind-item agent ${it.side}`}>
                <div className="who"><b>{WHO[it.side]}</b> {it.role}</div>
                {it.thought && <p className="thinks">{it.thought}</p>}
                {it.lines.map((l, k) => <p key={k} className={`does${l.tone ? ` ${l.tone}` : ""}${l.quote ? " quote" : ""}`}>{l.crs && <span className="badge live mini">CRS</span>}{l.crs ? " " : ""}{l.quote ? `“${l.text}”` : l.text}</p>)}
              </li>
            ))}
          {wait && (
            <li className={`mind-item ${wait.side === "you" ? "mind-note you" : `agent pending ${wait.side}`}`}>
              {wait.side === "you" ? wait.text : <>
                <div className="who"><b>{WHO[wait.side]}</b> {wait.text}</div>
                <p className="dots" aria-label="thinking"><i /><i /><i /><span>{secs >= 1 ? `${secs}s` : ""}</span></p>
              </>}
            </li>
          )}
        </ol>
      </div>
    </aside>
  );
}
