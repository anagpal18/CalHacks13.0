// The 2D side panel. On top, the story: where we are, what just happened in plain words, what each side wants,
// and one Start button. Below, three tabs: the transcript (every claim, verdict, offer and rule that decided
// something), the CRS console (every call), and the Rulebook (the active rules; a rule pulses when it decides).

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { fmtUsd, type Citation, type Offer, type RuleId } from "@terms-room/shared";
import { CONTRACTOR, EXHIBIT_LABEL, FACT_LABEL, TIER_NAME, scenarioCase, tierLine } from "@terms-room/api/negotiation";
import { useStore } from "../state/store";
import { chapterStarts } from "../state/derive";
import { focusCard, focusExhibit, focusOffer } from "./focus";
import { PRODUCT, VERDICT, shortTerms, story, titleCase, type StoryLine } from "./narrate";
import { LiveBadge } from "./Start";

const COND: Record<string, string> = { lien_release: "lien release", pay_supplier_direct: "supplier paid direct" };
export const terms = (o: Offer) => `net ${o.netDays} · ${o.depositPct}% upfront`;
const CHAPTERS = ["The pitch", "Cross-examination", "Risk tier", "Negotiation", "Verdict"];

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
      <div className="feed" role="tabpanel">
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
    for (let i = played - 1; i >= 0; i--) { const l = story(events[i], owner); if (l) return l; }
    return started
      ? { headline: "Setting the table…", detail: "", tone: "neutral" }
      : { headline: `${owner} wants ${sc.sub.business} on the job`, detail: `${titleCase(sc.sub.contact)} runs ${sc.sub.business}: ${sc.sub.trade.toLowerCase()}, ${sc.sub.scope.toLowerCase()}. Press Start to watch the two agents negotiate.`, tone: "neutral" };
  }, [events, played, owner, sc, started]);
  const final = t.closed ? "good" : t.ended ? "bad" : t.escalated ? "warn" : null;
  const ask = t.lastMade.sub ?? (t.ask ? { netDays: t.ask.netDays, depositPct: t.ask.upfrontPct, limitCents: t.ask.limitCents } : null);
  const opening = (t.rulebook ?? rb).vendorRules.opening;
  const theirs = ask ?? { netDays: opening.netDays, depositPct: opening.upfrontPct, limitCents: opening.limitCents };
  const ours = t.lastMade.contractor;
  const trustColor = t.trust < 35 ? "var(--bad)" : t.trust < 65 ? "var(--warn)" : "var(--good)";
  const n = t.chapter?.n ?? 0;
  return (
    <section className={`story${final ? ` final ${final}` : ""}`} aria-live="polite">
      <div className="story-top">
        <span className="eyebrow">{started ? (n ? `Chapter ${n} of 5 · ${CHAPTERS[n - 1]}` : "Starting") : `Ready · ${sc.sub.business}`}</span>
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
      <div className="sides">
        <div className="side sub">
          <div className="k">{owner} asks</div>
          <div className="v">{theirs.netDays} days</div>
          <div className="s">{theirs.depositPct}% up front · {fmtUsd(theirs.limitCents)} order</div>
        </div>
        <div className="side contractor">
          <div className="k">We offer</div>
          <div className="v">{ours ? `${ours.netDays} days` : "—"}</div>
          <div className="s">{ours ? `${ours.depositPct}% up front · ${fmtUsd(ours.limitCents)} order` : "after CRS checks their claims"}</div>
        </div>
      </div>
      {started && (
        <div className="trust" title="Every claim CRS verifies raises it; every claim CRS contradicts drops it">
          <span>Trust</span>
          <span className="bar"><i style={{ width: `${t.trust}%`, background: trustColor }} /></span>
          <b>{t.trust}</b>
        </div>
      )}
      {t.tier && !final && (
        <div className="tierline"><span className={`pill ${t.tier.tier === "low" ? "good" : t.tier.tier === "caution" ? "warn" : "bad"}`}>{TIER_NAME[t.tier.tier]}</span>
          <span style={{ color: "var(--muted)" }}> at best {t.tier.limits.bestNetDays} days · {t.tier.limits.maxUpfrontPct}% up front · {fmtUsd(t.tier.limits.limitCapCents)}</span></div>
      )}
      <div className="story-actions">
        {!started && <button className="btn primary start-btn" onClick={() => void st().start()}>Start</button>}
        {t.closed && !t.approved && (
          <button className="btn approve" onClick={() => void st().approve()}>
            Approve as {t.closed.approversNeeded > 1 ? `${CONTRACTOR.controller} + ${CONTRACTOR.secondApprover}` : CONTRACTOR.controller}
          </button>
        )}
        {started && (final || t.deposit) && <button className="btn" onClick={() => st().backToStart()}>Start over</button>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- transcript

function Cites({ cs }: { cs: Citation[] }) {
  return (
    <div className="cites">
      {cs.map((c, k) => (
        <button key={k} className="cite" title={`${c.product} ${c.field} = ${c.value} (call ${c.callId}). Opens the CRS console.`}
          onClick={(ev) => { ev.stopPropagation(); useStore.getState().openCall(c.callId, c.field); const pc = useStore.getState().table.cards.find((x) => x.card.citations.some((z) => z.callId === c.callId && z.field === c.field)); if (pc) focusCard(pc.card.id, false); }}>
          {PRODUCT[c.product]} {c.field.split(".").slice(-1)[0]} = {c.value}
        </button>
      ))}
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
            return <div key={i} className="ev"><span><b style={{ color: "var(--ink)" }}>{e.sub.business}</b> ({titleCase(e.sub.contact)}, {e.sub.persona}) asks {e.contractor} for net {e.ask.netDays}, {e.ask.upfrontPct}% upfront and a {fmtUsd(e.ask.limitCents)} first order: {e.sub.scope.toLowerCase()}.</span></div>;
          case "chapter":
            return <div key={i} className="chap"><span>Chapter {e.n}</span>{e.title}</div>;
          case "exhibit_played": {
            const x = e.exhibit;
            return (
              <div key={i} className={`offer sub exhibit${x.from === "judge" ? " judge" : ""}`} role="button" tabIndex={0}
                onClick={() => focusExhibit(x.id)} onKeyDown={(k) => { if (k.key === "Enter") focusExhibit(x.id); }}>
                <div className="who"><span>{x.label} · {x.from === "judge" ? "handed in by you" : "vendor agent"}</span><span>{x.claims.length} claim{x.claims.length === 1 ? "" : "s"}</span></div>
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
                {e.entry.source === "live" && <span className="badge live mini">LIVE</span>}
                {e.entry.side === "sub" ? " vendor ▸ " : " "}{PRODUCT[e.entry.product]} · {e.entry.summary} · {e.entry.callId.slice(0, 8)} · {e.entry.latencyMs} ms{e.entry.cached ? " · cached" : ""}
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
                <div className="who"><span>Round {o.round} · {o.from === "sub" ? "vendor agent" : "contractor agent"}</span><span>{e.type === "offer_rejected" ? "rejected" : "via gateway ✓"}</span></div>
                <div className="big">{shortTerms(o)}{o.conditions.length ? ` · ${o.conditions.map((c) => COND[c]).join(", ")}` : ""}</div>
                <q>{o.rationale}</q>
                {e.type === "offer_rejected" && e.reasons.map((r) => <div key={r} className="reason">{r}</div>)}
                <Cites cs={[...o.citations, ...(o.sharedCards ?? [])]} />
              </div>
            );
          }
          case "deal_closed":
            return <div key={i} className="ev"><span className="pill good">Agreed</span> {shortTerms(e.terms)} in {e.rounds} round{e.rounds > 1 ? "s" : ""}. Upfront {fmtUsd(e.depositCents)}.</div>;
          case "talks_ended":
            return <div key={i} className="ev"><span className="pill bad">Talks ended</span> {e.reasons.length} rule{e.reasons.length === 1 ? "" : "s"} said no. No upfront, no order.</div>;
          case "escalated":
            return <div key={i} className="ev"><span className="pill warn">Escalated</span> {e.reason}</div>;
          case "approved":
            return <div key={i} className="ev"><span className="pill good">Approved</span> by {e.approvers.join(" and ")}</div>;
          case "deposit_paid":
            return <div key={i} className="ev"><span className="pill good">Upfront sent</span> {fmtUsd(e.amountCents)} · {e.transferId}</div>;
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
                <td>{PRODUCT[e.product]}{e.source === "live" && <><br /><span className="badge live mini">LIVE CRS</span></>}<br /><span style={{ color: "var(--faint)" }}>{e.side === "sub" ? "vendor side" : "contractor"}</span></td>
                <td>{e.purpose}<br /><b>{e.summary}</b></td>
                <td className="mono">{e.callId.slice(0, 8)}<br />HTTP {e.status} · {e.latencyMs} ms<br />{e.at.slice(11, 19)} UTC{e.cached ? <><br />cached</> : null}</td>
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
  const sc = scenarioCase(rb);
  const Row = ({ ids, k, val, off }: { ids: RuleId[]; k: string; val: string; off?: boolean }) => {
    const hits = applied.filter((a) => ids.includes(a.ruleId));
    const last = hits.at(-1);
    return (
      <Fragment>
        <dt className={off ? "off" : undefined}>{k}</dt>
        <dd key={last?.at ?? 0} className={`${off ? "off" : ""}${last ? " applied pulse" : ""}`}>{val}{hits.length ? <span className="applied-tag">applied{hits.length > 1 ? ` ×${hits.length}` : ""}</span> : null}</dd>
      </Fragment>
    );
  };
  const t = (x: { netDays: number; upfrontPct: number; limitCents: number }) => `net ${x.netDays} · ${x.upfrontPct}% · ${fmtUsd(x.limitCents)}`;
  return (
    <div className="rules">
      <p className="note">The rules for this run, read-only. Change them with Start over. The gateway enforces the buyer's rules in code; both agents get them as constraints. A rule that decided something says so and pulses.</p>
      <h4>Scenario {rb.scenario.id}</h4>
      <dl>
        <dt>Vendor</dt><dd>{sc.sub.business} · owner {sc.owner}</dd>
      </dl>
      <h4>Buyer agent · our side</h4>
      <dl>
        <dt>Opening position</dt><dd>{t(b.opening)}</dd>
        <Row ids={["tier.low"]} k="Low risk" val={tierLine(rb, "low").replace(/^Low risk: /, "")} />
        <Row ids={["tier.caution"]} k="Caution" val={tierLine(rb, "caution").replace(/^Caution: /, "")} />
        <Row ids={["tier.blocked"]} k="Blocked" val={tierLine(rb, "blocked").replace(/^Blocked: /, "")} />
        <Row ids={["cap.net", "cap.upfront", "cap.limit"]} k="Gateway caps" val="our offers stay inside the tier's limits" />
        <Row ids={["anchor"]} k="Credit-limit anchor" val={b.creditLimitAnchor.on ? `limit ≤ ${b.creditLimitAnchor.pct}% of Risk Dashboard's recommended limit` : "off"} off={!b.creditLimitAnchor.on} />
        <Row ids={["stop.idv"]} k="Identity fails" val={hs.idvFails.on ? "talks end" : "off"} off={!hs.idvFails.on} />
        <Row ids={["stop.fraud_finder"]} k={`Fraud Finder ≥ ${hs.fraudFinder.threshold}`} val={hs.fraudFinder.on ? "talks end" : "off"} off={!hs.fraudFinder.on} />
        <Row ids={["stop.ofac"]} k="OFAC / watch-list" val={hs.ofac.on ? "talks end" : "off"} off={!hs.ofac.on} />
        <Row ids={["stop.inactive"]} k="Business inactive" val={hs.inactive.on ? "talks end" : "off"} off={!hs.inactive.on} />
        <Row ids={["stop.registered"]} k={`Registered < ${hs.registeredDays.days} days`} val={hs.registeredDays.on ? "talks end" : "off"} off={!hs.registeredDays.on} />
        <Row ids={["stop.look_alike"]} k="Look-alike in Quick Search" val={hs.lookAlike.on ? "talks end" : "off"} off={!hs.lookAlike.on} />
        <Row ids={["stop.mismatch"]} k="Phone, address or EIN mismatch" val={hs.mismatch.on ? "talks end" : "off"} off={!hs.mismatch.on} />
        <Row ids={["evidence"]} k="Evidence weights" val={`verified +${b.evidence.verified} · contradicted −${b.evidence.contradicted} · unverified −${b.evidence.unverified}`} />
        <Row ids={["escalate.fraud_alert"]} k="Fraud alert on file" val={b.escalate.fraudAlert ? "a person decides" : "off"} off={!b.escalate.fraudAlert} />
        <Row ids={["escalate.no_deal", "rounds.max"]} k="No deal" val={b.escalate.noDeal.on ? `after ${b.escalate.noDeal.rounds} rounds, a person decides` : `after ${rb.general.maxRounds} rounds, talks end`} />
        <Row ids={["approval.second"]} k="Approval" val={`${CONTRACTOR.controller}; second approver above ${fmtUsd(b.approval.secondApproverAboveCents)} upfront`} />
      </dl>
      <h4>Vendor agent · their side</h4>
      <dl>
        <dt>Opening ask</dt><dd>{t(v.opening)}</dd>
        <dt>Walk-away</dt><dd>{t(v.walkAway)}</dd>
        <dt>Style</dt><dd>{v.style}</dd>
        <Row ids={["consent"]} k="Consent" val={v.consent.allow ? `shares only: ${v.consent.facts.map((f) => FACT_LABEL[f]).join(", ") || "nothing"}` : "no credit data shared"} off={!v.consent.allow} />
        <dt>Exhibits</dt><dd>{v.exhibits.map((x) => EXHIBIT_LABEL[x]).join(", ") || "none"}</dd>
      </dl>
      <h4>General</h4>
      <dl>
        <dt>Max rounds</dt><dd>{rb.general.maxRounds}</dd>
        <dt>Story speed · narrator</dt><dd>{rb.general.speed}× · {rb.general.narrator ? "on" : "off"}</dd>
      </dl>
      <p className="note"><LiveBadge /> People data is the CRS sandbox's answers for these test personas. No criminal or eviction data is used anywhere.</p>
    </div>
  );
}
