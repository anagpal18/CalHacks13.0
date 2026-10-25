// Click anything on the table (or a citation, or a console row) and this shows where it came from: the CRS call,
// its masked response with every field the duel used highlighted, the claims it settled, and the rule it fed.

import { Fragment, useMemo, useState, type ReactNode } from "react";
import { fmtUsd, maskDeep, type Citation, type CrsLogEntry } from "@terms-room/shared";
import { CONTRACTOR, FACT_LABEL, TIER_NAME, consentFrom, tierLine } from "@terms-room/api/negotiation";
import { useStore, type Selection } from "../state/store";
import type { TableState } from "../state/derive";
import { terms } from "./Panel";
import { PRODUCT, VERDICT, shortTerms, titleCase } from "./narrate";
import { LiveBadge } from "./Start";

const PRODUCT_LONG: Record<string, string> = {
  tu_idv: "TransUnion identity verification", fraud_finder: "Fraud Finder (AtData)", reverse_phone: "Reverse phone (AccurateAppend)",
  pitchpoint: "PitchPoint bankruptcies, liens & judgments", credit_fact: "TransUnion credit report (one fact, shared with consent)", credit_report: "TransUnion credit report",
  biz_quick_search: "Quick Search (business)", biz_registration: "Corporate registration (secretary of state)", biz_fraud_shields: "Fraud Shields (business)", biz_risk_dashboard: "Risk Dashboard (business credit)",
};

const tokens = (field: string) => field.match(/[^.[\]]+|\[\d+\]/g) ?? [];
const pathKey = (parts: string[]) => parts.join(".").replace(/\.\[/g, "[");

/** Every field cited from this call anywhere in the run: cards, claims and offers. */
function usedFields(t: TableState, callId: string): string[] {
  const all: Citation[] = [...t.cards.flatMap((c) => c.card.citations), ...t.checks.flatMap((c) => c.check.citations),
    ...t.offers.flatMap((o) => [...o.offer.citations, ...(o.offer.sharedCards ?? [])])];
  return [...new Set(all.filter((c) => c.callId === callId).map((c) => c.field))];
}

/** Pretty JSON, one line per row, each knowing its path so cited fields can be highlighted. */
function jsonRows(value: unknown): { text: string; path: string }[] {
  const rows: { text: string; path: string }[] = [];
  const walk = (v: unknown, parts: string[], indent: string, label: string, comma: string) => {
    const key = pathKey(parts);
    if (v && typeof v === "object") {
      const arr = Array.isArray(v);
      const entries = arr ? (v as unknown[]).map((x, i) => [`[${i}]`, x] as const) : Object.entries(v as object);
      if (!entries.length) { rows.push({ text: `${indent}${label}${arr ? "[]" : "{}"}${comma}`, path: key }); return; }
      rows.push({ text: `${indent}${label}${arr ? "[" : "{"}`, path: key });
      entries.forEach(([k, x], i) => walk(x, [...parts, String(k)], indent + "  ", arr ? "" : `"${k}": `, i < entries.length - 1 ? "," : ""));
      rows.push({ text: `${indent}${arr ? "]" : "}"}${comma}`, path: key });
    } else rows.push({ text: `${indent}${label}${JSON.stringify(v)}${comma}`, path: key });
  };
  walk(value, [], "", "", "");
  return rows;
}

function ResponseJson({ entry, used, focus }: { entry: CrsLogEntry; used: string[]; focus?: string }) {
  const rows = useMemo(() => jsonRows(maskDeep(entry.response)), [entry]);
  const hit = (field: string) => {
    const p = tokens(field);
    return pathKey(p.at(-1) === "length" ? p.slice(0, -1) : p);
  };
  const usedKeys = new Set(used.map(hit));
  const focusKey = focus ? hit(focus) : null;
  return (
    <pre className="json tall" aria-label="Masked CRS response">
      {rows.map((r, i) => (
        <span key={i} className={!r.text.includes(":") ? undefined : r.path === focusKey ? "field-hit strong" : usedKeys.has(r.path) ? "field-hit" : undefined}>{r.text}{"\n"}</span>
      ))}
    </pre>
  );
}

function CallBody({ entry, focus }: { entry: CrsLogEntry; focus?: string }) {
  const t = useStore((s) => s.table);
  const used = usedFields(t, entry.callId);
  const settled = t.checks.filter((c) => c.check.citations.some((k) => k.callId === entry.callId));
  return (
    <>
      <div className="row">{entry.source === "live" && <LiveBadge />}{entry.cached && <span className="pill neutral">cached</span>}</div>
      <dl className="kv">
        <dt>Why</dt><dd>{entry.purpose}</dd>
        <dt>Result</dt><dd>{entry.summary}</dd>
        <dt>Call ID</dt><dd className="mono">{entry.callId}</dd>
        <dt>Answered</dt><dd>{entry.at.replace("T", " ").slice(0, 19)} UTC · HTTP {entry.status} · {entry.latencyMs} ms{entry.cached ? " · from the call cache" : ""}</dd>
        <dt>Endpoint</dt><dd className="mono">{entry.method} {entry.path}</dd>
        <dt>Subject</dt><dd>{entry.source === "live" ? `${entry.persona} (sandbox test persona; exact request body only)` : `business ${entry.persona}`}</dd>
      </dl>
      {settled.length > 0 && (
        <>
          <h3>Claims it settled</h3>
          {settled.map(({ check: c }) => <p key={c.claimId}><span className={`verdict ${c.verdict}`}>{VERDICT[c.verdict]}</span> {c.text}</p>)}
        </>
      )}
      <h3>Response {used.length ? `· ${used.length} field${used.length === 1 ? "" : "s"} used` : ""}</h3>
      {entry.response === null
        ? <p className="note">Withheld. This is the vendor's own report, pulled by its agent with its signed consent. It stays on the vendor's side; only the facts it chose to share left it: {t.cards.filter((c) => c.card.shared).map((c) => c.card.headline.toLowerCase()).join(", ") || "none yet"}.</p>
        : <ResponseJson entry={entry} used={used} focus={focus} />}
      <p className="note">SSNs and EINs are cut to the last 4. No request headers, tokens or IP addresses are stored or shown.</p>
    </>
  );
}

const Shell = ({ title, eyebrow, children }: { title: ReactNode; eyebrow: string; children: ReactNode }) => (
  <aside className="inspector" role="dialog" aria-label={typeof title === "string" ? title : eyebrow}>
    <button className="close" aria-label="Close" onClick={() => useStore.getState().select(null)}>×</button>
    <span className="eyebrow">{eyebrow}</span>
    <h2>{title}</h2>
    {children}
  </aside>
);

export function Inspector() {
  const sel = useStore((s) => s.selection);
  if (!sel) return null;
  return <Body sel={sel} />;
}

function Body({ sel }: { sel: Selection }) {
  const t = useStore((s) => s.table);
  const [peek, setPeek] = useState(false);
  const rb = t.rulebook;
  const entry = (id: string) => t.log.find((e) => e.callId === id);

  if (sel.kind === "call") {
    const e = entry(sel.callId);
    if (!e) return null;
    return <Shell eyebrow={`CRS console · ${e.side === "sub" ? "vendor side" : "contractor side"}`} title={PRODUCT_LONG[e.product]}><CallBody entry={e} focus={sel.field} /></Shell>;
  }

  if (sel.kind === "card") {
    const pc = t.cards.find((c) => c.card.id === sel.id);
    if (!pc) return null;
    const c = pc.card;
    const uses = t.checks.filter((x) => x.check.cardIds.includes(c.id));
    return (
      <Shell eyebrow={`${c.title} · ${c.side === "sub" ? "shared by the vendor" : "pulled by the contractor"}`} title={c.headline}>
        {c.source === "live" && <div className="row"><LiveBadge /></div>}
        <p>{c.detail}</p>
        {uses.length > 0 && <>{uses.map(({ check: u }) => <p key={u.claimId}><span className={`verdict ${u.verdict}`}>{VERDICT[u.verdict]}</span> “{u.text}” {u.delta >= 0 ? "+" : ""}{u.delta} trust</p>)}</>}
        {c.citations.map((k, i) => (
          <Fragment key={i}>
            <h3>Cited field {c.citations.length > 1 ? i + 1 : ""}</h3>
            <dl className="kv">
              <dt>Product</dt><dd>{PRODUCT_LONG[k.product]}</dd>
              <dt>Field</dt><dd className="mono">{k.field}</dd>
              <dt>Value</dt><dd className="mono">{k.value}</dd>
              <dt>Call ID</dt><dd className="mono">{k.callId}</dd>
            </dl>
          </Fragment>
        ))}
        {entry(c.citations[0]?.callId ?? "") && <div><button className="btn" onClick={() => useStore.getState().openCall(c.citations[0].callId, c.citations[0].field)}>Open the call in the CRS console</button></div>}
      </Shell>
    );
  }

  if (sel.kind === "exhibit") {
    const px = t.exhibits.find((x) => x.exhibit.id === sel.id);
    if (!px) return null;
    const x = px.exhibit;
    return (
      <Shell eyebrow={`${x.label} · ${x.from === "judge" ? "handed in by the judge" : "played by the vendor's agent"}`} title={x.title}>
        <p style={{ fontFamily: "var(--serif)", fontStyle: "italic" }}>“{x.argument}”</p>
        {x.fields && <dl className="kv">{x.fields.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>}
        {x.fileName && <p className="note">Uploaded file: {x.fileName}. It stays in this browser; only the fields above were cross-examined.</p>}
        <h3>Cross-examination</h3>
        {x.claims.map((cl) => {
          const ck = px.checks.find((c) => c.claimId === cl.id);
          return (
            <div key={cl.id} className={`claim ${ck?.verdict ?? "pending"}`}>
              <div className="claim-head"><span className={`verdict ${ck?.verdict ?? "pending"}`}>{ck ? VERDICT[ck.verdict] : "Checking"}</span><span className="claim-text">{cl.text}</span></div>
              {ck && <div className="claim-why">{ck.reason}</div>}
              {ck && ck.citations.length > 0 && (
                <div className="cites">{ck.citations.map((c, k) => (
                  <button key={k} className="cite" onClick={() => useStore.getState().openCall(c.callId, c.field)}>{PRODUCT[c.product]} {c.field.split(".").slice(-1)[0]} = {c.value}</button>
                ))}</div>
              )}
            </div>
          );
        })}
      </Shell>
    );
  }

  if (sel.kind === "offer") {
    const po = t.offers.find((o) => o.index === sel.index);
    if (!po) return null;
    const o = po.offer;
    return (
      <Shell eyebrow={`Round ${o.round} · ${o.from === "sub" ? "vendor agent" : "contractor agent"}`} title={`${shortTerms(o)}${po.rejected ? " · rejected" : ""}`}>
        <p style={{ fontFamily: "var(--serif)", fontStyle: "italic" }}>“{o.rationale}”</p>
        {po.rejected && <><h3>Why the gateway refused it</h3>{po.reasons.map((r) => <p key={r} className="reason">{r}</p>)}</>}
        <h3>The offer as JSON</h3>
        <pre className="json">{JSON.stringify(o, null, 2)}</pre>
      </Shell>
    );
  }

  const consent = rb && t.sub ? consentFrom(rb, t.sub, new Date()) : null;
  switch (sel.id) {
    case "report": {
      const held = !!t.report?.callId;
      return (
        <Shell eyebrow="Vendor side · face down" title={held ? "The vendor's own credit report" : "No report on the vendor's side"}>
          <p>{held ? "The vendor's own agent pulled this TransUnion report with its signed consent. It stays face down: the contractor sees only the facts the vendor chose to share." : t.report?.reason ?? "The consent gate decides whether the vendor's agent may pull a report."}</p>
          {held && <dl className="kv"><dt>Call ID</dt><dd className="mono">{t.report?.callId}</dd><dt>Shared</dt><dd>{t.cards.filter((c) => c.card.shared).map((c) => c.card.headline).join("; ") || "nothing yet"}</dd></dl>}
          {held && (!peek
            ? <div><button className="btn" onClick={() => setPeek(true)}>Turn it over</button></div>
            : <p className="reason">Refused. The full report belongs to the vendor's side of the table. Only the facts it shares leave it.</p>)}
        </Shell>
      );
    }
    case "consent":
      return (
        <Shell eyebrow="Consent gate" title={consent ? `Signed by ${titleCase(consent.signedBy)}` : "No signed consent"}>
          {consent ? <dl className="kv"><dt>Scope</dt><dd>{consent.scope.map((f) => FACT_LABEL[f]).join(", ")}</dd><dt>Purpose</dt><dd>{consent.purpose}</dd><dt>Expires</dt><dd>30 days after signing</dd></dl>
            : <p>The vendor's rules don't allow sharing credit data, so its agent can't pull a credit report and has nothing to share.</p>}
          <p className="note">FCRA permissible purpose is the vendor's written instruction. Consumer credit is used only on the vendor's side, and only the facts its consent names.</p>
        </Shell>
      );
    case "log":
      return (
        <Shell eyebrow="Data use" title={`${t.log.length} CRS call${t.log.length === 1 ? "" : "s"} for this negotiation`}>
          {t.log.map((e) => (
            <dl key={e.callId} className="kv" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <dt>Product</dt><dd>{PRODUCT_LONG[e.product]} {e.source === "live" ? <span className="badge live mini">LIVE</span> : <span className="badge sim mini">SIM</span>}</dd>
              <dt>Why</dt><dd>{e.purpose}</dd>
              <dt>Result</dt><dd>{e.summary}</dd>
              <dt>Call</dt><dd className="mono">{e.callId} · {e.latencyMs} ms{e.cached ? " · replayed from cache" : ""}</dd>
            </dl>
          ))}
          <div><button className="btn" onClick={() => useStore.getState().setTab("console")}>Open the CRS console</button></div>
          <p className="note">No request headers, tokens or IP addresses are stored or shown.</p>
        </Shell>
      );
    case "gauge":
      return (
        <Shell eyebrow="Trust meter · the deal bar" title={`Trust ${t.trust} of 100`}>
          <p>Starts at 50. Every verdict on a vendor claim moves it{rb ? `: verified +${rb.buyerRules.evidence.verified}, contradicted −${rb.buyerRules.evidence.contradicted}, unverified −${rb.buyerRules.evidence.unverified}` : ""}. The higher it goes, the closer our agent moves toward the vendor's ask, inside the tier's caps.</p>
          <dl className="kv">{t.checks.map(({ check: c }) => <Fragment key={c.claimId}><dt>{c.delta >= 0 ? "+" : ""}{c.delta}</dt><dd>{c.text}</dd></Fragment>)}</dl>
        </Shell>
      );
    case "dealbar":
      return (
        <Shell eyebrow="Deal bar" title={t.current ? `Now at ${t.current.depositPct}% upfront` : "Upfront, 0 to 50%"}>
          <p>The brass marker slides to each accepted offer's upfront %. The blue peg is our last offer, the copper peg is the vendor's.{t.tier && t.tier.tier !== "low" ? ` The red line is this tier's ${t.tier.limits.maxUpfrontPct}% cap.` : ""}</p>
          <dl className="kv">
            <dt>Vendor</dt><dd>{t.lastMade.sub ? shortTerms(t.lastMade.sub) : "—"}</dd>
            <dt>Contractor</dt><dd>{t.lastMade.contractor ? shortTerms(t.lastMade.contractor) : "—"}</dd>
          </dl>
        </Shell>
      );
    case "agent-contractor":
      return (
        <Shell eyebrow="Seat · works for us" title="Contractor agent (buyer)">
          <dl className="kv"><dt>Works for</dt><dd>{CONTRACTOR.name}</dd><dt>Wants</dt><dd>Longer net days, little or no upfront, a first order sized to the risk</dd>
            <dt>Uses CRS to</dt><dd>Cross-examine every claim: identity, phone, the business record, liens and judgments, payment habits</dd>
            <dt>Bound by</dt><dd>{rb ? `${tierLine(rb, "low")}; ${tierLine(rb, "caution")}` : "the buyer rules"}</dd></dl>
          <p className="note">Deterministic stand-in for Kenil's Creao agent. Same Offer JSON, same gateway.</p>
        </Shell>
      );
    case "agent-sub":
      return (
        <Shell eyebrow="Seat · works for the vendor" title="Vendor agent">
          <dl className="kv"><dt>Works for</dt><dd>{t.sub?.business ?? "the vendor"}</dd><dt>Wants</dt><dd>Paid fast, cash up front, a big first order</dd>
            <dt>Uses CRS to</dt><dd>Prove its claims, and share its own consented credit facts</dd>
            <dt>Style</dt><dd>{rb?.vendorRules.style ?? "balanced"}, walks away past {rb ? `net ${rb.vendorRules.walkAway.netDays}, ${rb.vendorRules.walkAway.upfrontPct}%, ${fmtUsd(rb.vendorRules.walkAway.limitCents)}` : "its walk-away"}</dd></dl>
          <p className="note">Deterministic stand-in for Kenil's Creao agent.</p>
        </Shell>
      );
    case "contract":
      return t.closed && t.sub ? (
        <Shell eyebrow="Vendor terms agreement" title={`${t.sub.business}: ${terms(t.closed.terms)}`}>
          <dl className="kv">
            <dt>Net days</dt><dd>{t.closed.terms.netDays}</dd>
            <dt>Upfront</dt><dd>{t.closed.terms.depositPct}% · {fmtUsd(t.closed.depositCents)}</dd>
            <dt>First-order limit</dt><dd>{fmtUsd(t.closed.terms.limitCents)}</dd>
            <dt>Conditions</dt><dd>{t.closed.terms.conditions.join(", ").replace(/_/g, " ") || "none"}</dd>
            <dt>Approval</dt><dd>{t.approved ? t.approved.approvers.join(" + ") : `needs ${t.closed.approversNeeded}`}</dd>
            <dt>Upfront payment</dt><dd>{t.deposit ? t.deposit.transferId : "not sent yet"}</dd>
          </dl>
        </Shell>
      ) : null;
    case "window":
      return (
        <Shell eyebrow="Out the window" title={CONTRACTOR.project}>
          <p>{CONTRACTOR.name} is building a six-storey concrete frame. {t.sub ? `${t.sub.business} would supply ${t.sub.scope.toLowerCase()}.` : ""}</p>
        </Shell>
      );
    case "receipt":
      return (
        <Shell eyebrow="Receipt printer" title={t.deposit ? `${fmtUsd(t.deposit.amountCents)} upfront sent` : "Nothing printed yet"}>
          <p>{t.deposit ? `Transfer ${t.deposit.transferId} to ${t.sub?.business}.` : "When the controller approves a deal, the upfront payment's receipt prints here."}</p>
        </Shell>
      );
    case "phone":
      return (
        <Shell eyebrow="Controller's line" title={t.escalated ? "Escalation waiting" : "No calls waiting"}>
          <p>{t.escalated ? t.escalated.reason : `The agents call the controller when a fraud alert is on file or when ${rb?.buyerRules.escalate.noDeal.rounds ?? 4} rounds pass without a deal.`}</p>
        </Shell>
      );
    case "whiteboard":
      return (
        <Shell eyebrow="Whiteboard" title="Rounds so far">
          {t.offers.length ? t.offers.map((o) => <p key={o.index}>Round {o.offer.round}, {o.offer.from === "sub" ? "vendor" : "us"}: {shortTerms(o.offer)}{o.rejected ? " (rejected by the gateway)" : ""}</p>) : <p className="empty">No offers yet.</p>}
        </Shell>
      );
    case "policy":
      return rb ? (
        <Shell eyebrow="Vendor terms policy" title="Limits the gateway enforces">
          <dl className="kv">
            {(["low", "caution", "blocked"] as const).map((x) => <Fragment key={x}><dt>{TIER_NAME[x]}</dt><dd>{tierLine(rb, x).split(": ")[1]}</dd></Fragment>)}
            <dt>Anchor</dt><dd>{rb.buyerRules.creditLimitAnchor.on ? `${rb.buyerRules.creditLimitAnchor.pct}% of Risk Dashboard's recommended limit` : "off"}</dd>
            <dt>Rounds</dt><dd>{rb.general.maxRounds}, then {rb.buyerRules.escalate.noDeal.on ? "a person decides" : "talks end"}</dd>
            <dt>Approvals</dt><dd>two above {fmtUsd(rb.buyerRules.approval.secondApproverAboveCents)} upfront</dd>
          </dl>
          <div><button className="btn" onClick={() => useStore.getState().setTab("rulebook")}>Open the full Rulebook</button></div>
        </Shell>
      ) : null;
    default:
      return null;
  }
}
