// The 2D side panel. On top, the story: where we are, what just happened in plain words, what each side wants,
// and one Start button. Below, three tabs: the transcript (every claim, verdict, offer and rule that decided
// something), the CRS console (every call), and the Rulebook (the active rules; a rule pulses when it decides).

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtUsd, type Citation, type Offer, type RuleId } from "@terms-room/shared";
import { CONTRACTOR, EXHIBIT_LABEL, FACT_LABEL, TIER_NAME, scenarioCase } from "@terms-room/api/negotiation";
import { useStore } from "../state/store";
import { chapterStarts } from "../state/derive";
import { focusCard, focusExhibit, focusOffer } from "./focus";
import { PRODUCT, VERDICT, shortTerms, story, titleCase, type StoryLine } from "./narrate";
import { CrsBadge } from "./Start";

const COND: Record<string, string> = { lien_release: "lien release", pay_supplier_direct: "supplier paid direct" };
export const terms = (o: Offer) => `paid in ${o.netDays} days · ${o.depositPct}% up front`;
const CHAPTERS = ["The pitch", "Cross-examination", "Risk level", "Negotiation", "Verdict"];

export function Panel() {
  const tab = useStore((s) => s.tab);
  const [collapsed, setCollapsed] = useState(false);
  const st = useStore.getState;
  return (
    <aside className={`panel${collapsed ? " collapsed" : ""}`} aria-label="Negotiation">
      <Story collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="tabs" role="tablist">
        {(["transcript", "console"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => st().setTab(t)}>
            {t === "transcript" ? "Transcript" : "CRS console"}
          </button>
        ))}
        <RulebookChip selected={tab === "rulebook"} />
      </div>
      <div className="feed" role="tabpanel" key={tab}>
        {tab === "transcript" ? <Feed /> : tab === "console" ? <Console /> : <RulebookTab />}
      </div>
    </aside>
  );
}

/** The Rulebook tab doubles as the chip: its dot pulses and its count climbs each time a rule decides something. */
function RulebookChip({ selected }: { selected: boolean }) {
  const rules = useStore((s) => s.table.rules);
  const last = rules.at(-1);
  return (
    <button role="tab" aria-selected={selected} className="chip-rulebook" onClick={() => useStore.getState().setTab("rulebook")} title="The active rules, read-only">
      <span key={last?.at ?? 0} className={`rb-dot${last ? " pulse" : ""}`} />
      Rulebook{rules.length ? <span className="rb-count">{rules.length} applied</span> : null}
    </button>
  );
}

// ---------------------------------------------------------------- the story card

function Story({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useStore((s) => s.table);
  const events = useStore((s) => s.events);
  const played = useStore((s) => s.played);
  const busy = useStore((s) => s.busy);
  const rb = useStore((s) => s.rulebook);
  const st = useStore.getState;
  const started = events.length > 0 || busy;
  const sc = useMemo(() => scenarioCase(t.rulebook ?? rb), [t.rulebook, rb]);
  const owner = titleCase(sc.sub.contact.split(" ")[0]);
  const starts = useMemo(() => chapterStarts(events), [events]);
  const line: StoryLine = useMemo(() => {
    if (t.closed) {
      const needs = t.closed.approversNeeded > 1 ? "two approvals" : "the controller's approval";
      return t.deposit
        ? { headline: "Deal done", detail: `${t.approved?.approvers.join(" and ")} approved it, and ${fmtUsd(t.deposit.amountCents)} went out up front.`, tone: "good" }
        : { headline: "Deal agreed", detail: `Waiting for ${needs} before any money moves.`, tone: "good" };
    }
    for (let i = played - 1; i >= 0; i--) { const l = story(events[i], owner); if (l) return l; }
    return started
      ? { headline: "Setting the table…", detail: "", tone: "neutral" }
      : { headline: `${owner} wants ${sc.sub.business} on the job`, detail: `${sc.sub.trade}: ${sc.sub.scope.toLowerCase()}. Press Start to watch the two agents negotiate.`, tone: "neutral" };
  }, [events, played, owner, sc, started, t.closed, t.approved, t.deposit]);
  const final = t.closed ? "good" : t.ended ? "bad" : t.escalated ? "warn" : null;
  const opening = (t.rulebook ?? rb).vendorRules.opening;
  const theirs = t.lastMade.sub ?? { netDays: opening.netDays, depositPct: opening.upfrontPct, limitCents: opening.limitCents };
  const ours = t.lastMade.contractor;
  const trustTone = t.trust < 35 ? "bad" : t.trust < 65 ? "warn" : "good";
  const n = t.chapter?.n ?? 0;
  const deal = t.closed?.terms;
  return (
    <section className={`story${final ? ` final ${final}` : ""}`} aria-live="polite">
      <div className="story-top">
        <span className="eyebrow">{started ? (n ? `Chapter ${n} of 5 · ${CHAPTERS[n - 1]}` : "Starting") : "Ready"}</span>
        <button className="btn sheet-toggle" onClick={onToggle} aria-expanded={!collapsed}>{collapsed ? "Show" : "Hide"}</button>
      </div>
      <div className="story-steps" role="group" aria-label="Chapters">
        {CHAPTERS.map((title, k) => {
          const s = starts.find((x) => x.n === k + 1);
          const state = !s ? (n > k + 1 ? "skipped" : "todo") : n === k + 1 ? "now" : n > k + 1 ? "done" : "todo";
          return <button key={title} className={`step ${state}`} disabled={!s} title={s ? `Replay from: ${title}` : title} onClick={() => s && st().seek(s.index)} aria-label={title} />;
        })}
      </div>
      <h2 key={line.headline} className={`story-headline tone-${line.tone}`}>{line.headline}</h2>
      {line.detail && <p className="story-detail">{line.detail}</p>}

      {deal ? (
        <div className="agreed" aria-label="Agreed terms">
          <div><b>{deal.netDays} days</b><span>until we pay</span></div>
          <div><b>{deal.depositPct}%</b><span>up front · {fmtUsd(t.closed!.depositCents)}</span></div>
          <div><b>{fmtUsd(deal.limitCents)}</b><span>first order</span></div>
        </div>
      ) : (
        <table className="compare" aria-label="Where each side stands">
          <thead><tr><th /><th className="sub">{owner} asks</th><th className="contractor">We offer</th></tr></thead>
          <tbody>
            <tr><th>Paid in</th><td className="sub">{theirs.netDays} days</td><td className="contractor">{ours ? `${ours.netDays} days` : "—"}</td></tr>
            <tr><th>Up front</th><td className="sub">{theirs.depositPct}%</td><td className="contractor">{ours ? `${ours.depositPct}%` : "—"}</td></tr>
            <tr><th>First order</th><td className="sub">{fmtUsd(theirs.limitCents)}</td><td className="contractor">{ours ? fmtUsd(ours.limitCents) : "—"}</td></tr>
          </tbody>
        </table>
      )}

      {started && (
        <div className="meter" title="Every claim CRS verifies raises it; every claim CRS contradicts drops it">
          <span>Trust in {owner}</span>
          <span className={`bar ${trustTone}`}><i style={{ width: `${t.trust}%` }} /></span>
          <b>{t.trust}</b>
        </div>
      )}
      {t.tier && !final && (
        <div className="risk">
          <span className={`pill ${t.tier.tier === "low" ? "good" : t.tier.tier === "caution" ? "warn" : "bad"}`}>{TIER_NAME[t.tier.tier]}</span>
          <span>we can pay in {t.tier.limits.bestNetDays}+ days · {t.tier.limits.maxUpfrontPct}% up front · first order up to {fmtUsd(t.tier.limits.limitCapCents)}</span>
        </div>
      )}
      <div className="story-actions">
        {!started && <button className="btn primary start-btn" onClick={() => void st().start()}>Start</button>}
        {t.closed && !t.approved && (
          <button className="btn approve" onClick={() => void st().approve()}>
            Approve as {t.closed.approversNeeded > 1 ? `${CONTRACTOR.controller} + ${CONTRACTOR.secondApprover}` : CONTRACTOR.controller}
          </button>
        )}
        {started && (final || t.deposit) && <button className="btn ghost" onClick={() => st().backToStart()}>Start over</button>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- transcript

/** The CRS fields a claim or offer rests on. Two show; the rest fold into "+N more" (all of them are in the console). */
function Cites({ cs }: { cs: Citation[] }) {
  const open = (c: Citation) => {
    useStore.getState().openCall(c.callId, c.field);
    const pc = useStore.getState().table.cards.find((x) => x.card.citations.some((z) => z.callId === c.callId && z.field === c.field));
    if (pc) focusCard(pc.card.id, false);
  };
  return (
    <div className="cites">
      {cs.slice(0, 2).map((c, k) => (
        <button key={k} className="cite" title={`${c.product} ${c.field} = ${c.value} (call ${c.callId}). Opens the CRS console.`}
          onClick={(ev) => { ev.stopPropagation(); open(c); }}>
          {PRODUCT[c.product]} {c.field.split(".").slice(-1)[0]} = {c.value}
        </button>
      ))}
      {cs.length > 2 && <button className="cite more" onClick={(ev) => { ev.stopPropagation(); open(cs[2]); }} title="See every field in the CRS console">+{cs.length - 2} more</button>}
    </div>
  );
}

const RuleLine = ({ id, text }: { id: RuleId; text: string }) => (
  <button className="rule-line" onClick={() => useStore.getState().setTab("rulebook")} data-rule={id} title="Show it in the Rulebook">
    <b>Rule applied:</b> {text}
  </button>
);

function Feed() {
  const events = useStore((s) => s.events);
  const played = useStore((s) => s.played);
  const shown = useMemo(() => events.slice(0, played), [events, played]);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [played]);
  if (!shown.length) return <p className="empty">Press Start. Every claim, check and offer will show up here.</p>;
  let offerIdx = -1;
  return (
    <>
      {shown.map((e, i) => {
        switch (e.type) {
          case "negotiation_started":
            return <div key={i} className="ev"><span><b style={{ color: "var(--ink)" }}>{e.sub.business}</b> ({titleCase(e.sub.contact)}, {e.sub.persona}) asks {e.contractor} to be paid in {e.ask.netDays} days, with {e.ask.upfrontPct}% up front and a {fmtUsd(e.ask.limitCents)} first order: {e.sub.scope.toLowerCase()}.</span></div>;
          case "chapter":
            return <div key={i} className="chap"><span>Chapter {e.n}</span>{e.title}</div>;
          case "exhibit_played": {
            const x = e.exhibit;
            return (
              <div key={i} className={`offer sub exhibit${x.from === "judge" ? " judge" : ""}`} role="button" tabIndex={0}
                onClick={() => focusExhibit(x.id)} onKeyDown={(k) => { if (k.key === "Enter") focusExhibit(x.id); }}>
                <div className="who"><span>{x.label} · {x.from === "judge" ? "handed in by you" : "vendor's agent"}</span><span>{x.claims.length} claim{x.claims.length === 1 ? "" : "s"}</span></div>
                <div className="big">{x.title}</div>
                <q>{x.argument}</q>
                {x.fileName && <div className="s">File: {x.fileName} (stays in this browser)</div>}
              </div>
            );
          }
          case "upload_requested":
            return <div key={i} className="ev">The duel pauses for your document.</div>;
          case "claim_checked": {
            const c = e.check;
            return (
              <div key={i} className={`claim ${c.verdict}`}>
                <div className="claim-head"><span className={`verdict ${c.verdict}`}>{VERDICT[c.verdict]}</span><span className="claim-text">{c.text}</span>
                  <span className="delta">{c.delta >= 0 ? "+" : ""}{c.delta}</span></div>
                <div className="claim-why">{c.reason}</div>
                {c.citations.length > 0 && <Cites cs={c.citations} />}
              </div>
            );
          }
          case "rule_applied":
            return <div key={i} className="ev"><RuleLine id={e.ruleId} text={e.text} /></div>;
          case "crs_call":
            return (
              <button key={i} className="ev call" onClick={() => useStore.getState().openCall(e.entry.callId)} title="Open in the CRS console">
                <span className="badge live mini">CRS</span>
                {e.entry.side === "sub" ? " vendor ▸ " : " "}{PRODUCT[e.entry.product]} · {e.entry.summary} · {e.entry.callId.slice(0, 8)} · {e.entry.latencyMs} ms
              </button>
            );
          case "card_landed":
            return (
              <div key={i} className="ev">
                <button className="chip" onClick={() => focusCard(e.card.id)}>
                  <span className={`dot ${e.card.tone}`} />
                  <span>{e.card.headline}</span>
                  <span style={{ color: "var(--faint)" }}>{e.card.side === "sub" ? "shared by the vendor" : ""}</span>
                </button>
              </div>
            );
          case "report_held":
            return <div key={i} className="ev">{e.reason}</div>;
          case "tier_changed":
            return <div key={i} className="ev"><span className={`pill ${e.tier === "low" ? "good" : e.tier === "caution" ? "warn" : "bad"}`}>{TIER_NAME[e.tier]}</span></div>;
          case "offer_made":
          case "offer_rejected": {
            offerIdx++;
            const idx = offerIdx;
            const o = e.offer;
            return (
              <div key={i} className={`offer ${o.from}${e.type === "offer_rejected" ? " rejected" : ""}`} role="button" tabIndex={0}
                onClick={() => focusOffer(idx)} onKeyDown={(k) => { if (k.key === "Enter") focusOffer(idx); }}>
                <div className="who"><span>Round {o.round} · {o.from === "sub" ? "vendor's agent" : "our agent"}</span><span>{e.type === "offer_rejected" ? "rules said no" : "passed the rule check ✓"}</span></div>
                <div className="big">{shortTerms(o)}{o.conditions.length ? ` · ${o.conditions.map((c) => COND[c]).join(", ")}` : ""}</div>
                <q>{o.rationale}</q>
                {e.type === "offer_rejected" && e.reasons.map((r) => <div key={r} className="reason">{r}</div>)}
                <Cites cs={[...o.citations, ...(o.sharedCards ?? [])]} />
              </div>
            );
          }
          case "deal_closed":
            return <div key={i} className="ev"><span className="pill good">Agreed</span> {shortTerms(e.terms)} in {e.rounds} round{e.rounds > 1 ? "s" : ""}. Up front: {fmtUsd(e.depositCents)}.</div>;
          case "talks_ended":
            return <div key={i} className="ev"><span className="pill bad">Talks ended</span> {e.reasons.length} rule{e.reasons.length === 1 ? "" : "s"} said no. Nothing paid, no order.</div>;
          case "escalated":
            return <div key={i} className="ev"><span className="pill warn">Escalated</span> {e.reason}</div>;
          case "approved":
            return <div key={i} className="ev"><span className="pill good">Approved</span> by {e.approvers.join(" and ")}</div>;
          case "deposit_paid":
            return <div key={i} className="ev"><span className="pill good">Up-front payment sent</span> {fmtUsd(e.amountCents)} · {e.transferId}</div>;
        }
      })}
      <div ref={end} />
    </>
  );
}

// ---------------------------------------------------------------- CRS console

function Console() {
  const log = useStore((s) => s.table.log);
  const focus = useStore((s) => s.focusCall);
  const sel = useStore((s) => s.selection);
  const rows = useRef<Record<string, HTMLTableRowElement | null>>({});
  useEffect(() => { if (focus) rows.current[focus.callId]?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [focus]);
  if (!log.length) return <p className="empty">No CRS calls yet.</p>;
  return (
    <>
      <p className="note">Every CRS call for this negotiation. Click one for the response, with the fields the duel used highlighted. SSNs and EINs are cut to the last 4. No headers or tokens are stored or shown.</p>
      <div className="scroll-x">
        <table className="log console">
          <thead><tr><th>Product</th><th>Purpose · result</th><th>Call</th></tr></thead>
          <tbody>
            {log.map((e) => (
              <tr key={e.callId} ref={(el) => { rows.current[e.callId] = el; }}
                className={`${sel?.kind === "call" && sel.callId === e.callId ? "on" : ""}${focus?.callId === e.callId ? " flash" : ""}`}
                onClick={() => useStore.getState().openCall(e.callId)} tabIndex={0} onKeyDown={(k) => { if (k.key === "Enter") useStore.getState().openCall(e.callId); }}>
                <td>{PRODUCT[e.product]}<br /><span className="badge live mini">CRS</span><br /><span style={{ color: "var(--faint)" }}>{e.side === "sub" ? "vendor side" : "contractor"}</span></td>
                <td>{e.purpose}<br /><b>{e.summary}</b></td>
                <td className="mono">{e.callId.slice(0, 8)}<br />HTTP {e.status} · {e.latencyMs} ms<br />{e.at.slice(11, 19)} UTC</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Rulebook (read-only)

function RulebookTab() {
  const rb = useStore((s) => s.table.rulebook ?? s.rulebook);
  const applied = useStore((s) => s.table.rules);
  const b = rb.buyerRules, v = rb.vendorRules, hs = b.hardStops;
  const hits = (ids: RuleId[]) => applied.filter((a) => ids.includes(a.ruleId));
  const Applied = ({ ids }: { ids: RuleId[] }) => {
    const h = hits(ids);
    return h.length ? <span key={h.at(-1)!.at} className="applied-tag pulse">Applied{h.length > 1 ? ` ×${h.length}` : ""}</span> : null;
  };
  const Row = ({ ids, label, value, off }: { ids: RuleId[]; label: string; value: string; off?: boolean }) => (
    <li className={`rb-row${off ? " off" : ""}${hits(ids).length ? " hit" : ""}`}>
      <span className="rb-label">{label}</span>
      <span className="rb-value">{off ? "Off" : value}</span>
      <Applied ids={ids} />
    </li>
  );
  const terms3 = (x: { netDays: number; upfrontPct: number; limitCents: number }) => `paid in ${x.netDays} days · ${x.upfrontPct}% up front · ${fmtUsd(x.limitCents)} first order`;
  const TIERS = [["low", "tier.low"], ["caution", "tier.caution"], ["blocked", "tier.blocked"]] as const;
  return (
    <div className="rulebook">
      <p className="rb-intro">Set before the run and checked in code on every offer. <b>Gold</b> marks a rule that decided something.</p>

      <section className="rb-card">
        <h4>How far we'll go, by risk</h4>
        <table className="rb-tiers">
          <thead><tr><th /><th>Pay in</th><th>Up front</th><th>First order</th></tr></thead>
          <tbody>
            {TIERS.map(([tier, id]) => {
              const x = b.tiers[tier];
              return (
                <tr key={tier} className={hits([id, "cap.net", "cap.upfront", "cap.limit"]).some((h) => h.ruleId === id) ? "hit" : undefined}>
                  <th><span className={`dot ${tier === "low" ? "good" : tier === "caution" ? "warn" : "bad"}`} />{TIER_NAME[tier]}</th>
                  <td>{x.bestNetDays}+ days</td><td>≤ {x.maxUpfrontPct}%</td><td>≤ {fmtUsd(x.maxLimitCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ul className="rb-list">
          <Row ids={["cap.net", "cap.upfront", "cap.limit"]} label="Our offers stay inside these limits" value="Always" />
          <Row ids={["anchor"]} label="First order capped at a share of the limit CRS suggests" value={`≤ ${b.creditLimitAnchor.pct}%`} off={!b.creditLimitAnchor.on} />
          <Row ids={[]} label="We open at" value={terms3(b.opening)} />
        </ul>
      </section>

      <section className="rb-card">
        <h4>Deal-breakers</h4>
        <ul className="rb-list">
          <Row ids={["stop.idv"]} label="Identity check fails" value="Talks end" off={!hs.idvFails.on} />
          <Row ids={["stop.fraud_finder"]} label={`Fraud Finder score ≥ ${hs.fraudFinder.threshold}`} value="Talks end" off={!hs.fraudFinder.on} />
          <Row ids={["stop.mismatch"]} label="Phone, address or EIN doesn't match" value="Talks end" off={!hs.mismatch.on} />
          <Row ids={["stop.look_alike"]} label="Copycat of an older business" value="Talks end" off={!hs.lookAlike.on} />
          <Row ids={["stop.registered"]} label={`Registered under ${hs.registeredDays.days} days ago`} value="Talks end" off={!hs.registeredDays.on} />
          <Row ids={["stop.ofac"]} label="OFAC / watch-list hit" value="Talks end" off={!hs.ofac.on} />
          <Row ids={["stop.inactive"]} label="Business inactive" value="Talks end" off={!hs.inactive.on} />
          <Row ids={["escalate.fraud_alert"]} label="Fraud alert on file" value="A person decides" off={!b.escalate.fraudAlert} />
          <Row ids={["escalate.no_deal", "rounds.max"]} label={`No deal after ${b.escalate.noDeal.on ? b.escalate.noDeal.rounds : rb.general.maxRounds} rounds`} value={b.escalate.noDeal.on ? "A person decides" : "Talks end"} />
        </ul>
      </section>

      <section className="rb-card">
        <h4>How evidence moves trust</h4>
        <div className="rb-chips">
          <span className="chip-v good">Verified +{b.evidence.verified}</span>
          <span className="chip-v bad">Contradicted −{b.evidence.contradicted}</span>
          <span className="chip-v neutral">Unverified −{b.evidence.unverified}</span>
        </div>
      </section>

      <section className="rb-card">
        <h4>Who signs off</h4>
        <ul className="rb-list">
          <Row ids={[]} label={CONTRACTOR.controller} value="Every deal" />
          <Row ids={["approval.second"]} label={`Plus ${CONTRACTOR.secondApprover}`} value={`Over ${fmtUsd(b.approval.secondApproverAboveCents)} up front`} />
        </ul>
      </section>

      <section className="rb-card vendor">
        <h4>The vendor's side</h4>
        <ul className="rb-list">
          <Row ids={[]} label="Asks for" value={terms3(v.opening)} />
          <Row ids={[]} label="Walks away past" value={terms3(v.walkAway)} />
          <Row ids={[]} label="Style" value={v.style[0].toUpperCase() + v.style.slice(1)} />
          <Row ids={["consent"]} label="Shares credit facts" value={v.consent.allow ? v.consent.facts.map((f) => FACT_LABEL[f]).join(", ") || "None" : "No"} />
        </ul>
        <div className="rb-chips">{v.exhibits.map((x) => <span key={x} className="chip-v neutral">{EXHIBIT_LABEL[x]}</span>)}</div>
      </section>

      <p className="rb-foot"><CrsBadge /> marks every CRS check. No criminal or eviction data is used.</p>
    </div>
  );
}
