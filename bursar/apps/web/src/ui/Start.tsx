// The start page: pick a scenario, set both agents' rules, enter the deal room. The rules become the Rulebook
// that the engine, gateway and agents obey (and that POST /deals carries when the API is on).
// The cards only describe each vendor: what happens is up to the agents and the rules.

import { useMemo, useState, type ReactNode } from "react";
import type { BusinessProfileId, CreditFact, RiskTier, Rulebook, ScenarioId, Terms, VendorExhibit } from "@terms-room/shared";
import { CONTRACTOR, CREDIT_FACTS, EXHIBIT_LABEL, FACT_LABEL, OWNERS, SCENARIO_IDS, VENDOR_EXHIBITS, fmtAddress, scenarioCase, switchScenario, type PresetId } from "@terms-room/api/negotiation";
import { useStore } from "../state/store";

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
const PROFILES: [BusinessProfileId, string][] = [["clean", "Clean"], ["slow_payer", "Slow payer"], ["brand_new", "Brand-new registration"],
  ["look_alike", "Look-alike"], ["ofac_hit", "OFAC hit"], ["ucc_heavy", "UCC-heavy"]];
const TIERS: [RiskTier, string][] = [["low", "Low risk"], ["caution", "Caution"], ["blocked", "Blocked"]];
const PRESETS: [PresetId, string, string][] = [
  ["demo", "Demo default", "Balanced rules"],
  ["strict", "Strict buyer", "Lower caps, tighter cut-offs"],
  ["friendly", "Friendly buyer", "Higher caps, looser cut-offs"],
];

export const LiveBadge = () => <span className="badge live" title="Real CRS sandbox data for a test persona">LIVE CRS</span>;

export function Start() {
  const rb = useStore((s) => s.rulebook);
  const ready = useStore((s) => s.sceneReady);
  const st = useStore.getState;
  const set = st().setRulebook;
  return (
    <div className="start" role="dialog" aria-label="Set up the deal">
      <div className="start-sheet">
        <header className="start-head">
          <span className="eyebrow">Cal Hacks 13.0 · CRS track</span>
          <h1>Bursar</h1>
          <p>{CONTRACTOR.name} is onboarding a vendor for {CONTRACTOR.project}. Two AI agents negotiate when we pay, how much up front, and how big the first order is. CRS checks every claim.</p>
          <div className="row legend"><LiveBadge /><span>people data from the CRS sandbox personas</span></div>
        </header>

        <Section n={1} title="Pick a vendor">
          <div className="scenarios" role="radiogroup" aria-label="Vendor">
            {SCENARIO_IDS.map((id) => <ScenarioCard key={id} id={id} rb={rb} />)}
          </div>
        </Section>

        <Section n={2} title="Pick the rules">
          <div className="quick">
            <div className="presets" role="radiogroup" aria-label="Rules">
              {PRESETS.map(([p, label, hint]) => (
                <button key={p} role="radio" aria-checked={rb.preset === p} className={`preset${rb.preset === p ? " on" : ""}`} onClick={() => st().applyPreset(p)}>
                  <b>{label}</b><span>{hint}</span>
                </button>
              ))}
            </div>
            <div className="knobs">
              <label>Fraud Finder cut-off <Num value={rb.buyerRules.hardStops.fraudFinder.threshold} min={1} max={100} onChange={(v) => set((r) => { r.buyerRules.hardStops.fraudFinder.threshold = v; })} /></label>
              <label>Most we pay up front <Num value={rb.buyerRules.tiers.low.maxUpfrontPct} min={0} max={30} step={5} suffix="%" onChange={(v) => set((r) => { r.buyerRules.tiers.low.maxUpfrontPct = v; })} /></label>
              <label>Vendor style
                <span className="group seg" role="group" aria-label="Vendor style">
                  {(["firm", "balanced", "flexible"] as const).map((x) => <button key={x} aria-pressed={rb.vendorRules.style === x} onClick={() => set((r) => { r.vendorRules.style = x; })}>{x[0].toUpperCase() + x.slice(1)}</button>)}
                </span>
              </label>
              <label>Speed
                <span className="group seg" role="group" aria-label="Story speed">
                  {[1, 2, 3].map((n) => <button key={n} aria-pressed={rb.general.speed === n} onClick={() => set((r) => { r.general.speed = n; })}>{n}×</button>)}
                </span>
              </label>
            </div>
          </div>
        </Section>

        <details className="advanced">
          <summary>Customize every rule</summary>
        <div className="start-cols">
          <Section n={3} title="Buyer agent rules" sub={`Our side: ${CONTRACTOR.name}'s contractor agent. The gateway enforces these in code, not just in the prompt.`}>
            <TermsRow label="Opening position" t={rb.buyerRules.opening} onChange={(t) => set((r) => { r.buyerRules.opening = t; })} />
            <Group label="Limits by risk tier">
              <table className="tiers">
                <thead><tr><th /><th>Best net days</th><th>Max upfront</th><th>Max limit</th></tr></thead>
                <tbody>
                  {TIERS.map(([t, name]) => (
                    <tr key={t}>
                      <th scope="row">{name}</th>
                      <td><Num value={rb.buyerRules.tiers[t].bestNetDays} min={15} max={60} step={5} prefix="net " onChange={(v) => set((r) => { r.buyerRules.tiers[t].bestNetDays = v; })} /></td>
                      <td><Num value={rb.buyerRules.tiers[t].maxUpfrontPct} min={0} max={30} step={5} suffix="%" onChange={(v) => set((r) => { r.buyerRules.tiers[t].maxUpfrontPct = v; })} /></td>
                      <td><Money cents={rb.buyerRules.tiers[t].maxLimitCents} onChange={(v) => set((r) => { r.buyerRules.tiers[t].maxLimitCents = v; })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Group>
            <Group label="Credit-limit anchor">
              <Toggle checked={rb.buyerRules.creditLimitAnchor.on} onChange={(v) => set((r) => { r.buyerRules.creditLimitAnchor.on = v; })}
                label="Use Risk Dashboard's recommended credit limit">
                <span className="inline">cap at <Num value={rb.buyerRules.creditLimitAnchor.pct} min={10} max={100} step={5} suffix="%" disabled={!rb.buyerRules.creditLimitAnchor.on}
                  onChange={(v) => set((r) => { r.buyerRules.creditLimitAnchor.pct = v; })} /> of it</span>
              </Toggle>
            </Group>
            <Group label="Hard stops: talks end when…">
              <Stop on={rb.buyerRules.hardStops.idvFails.on} set={(v) => set((r) => { r.buyerRules.hardStops.idvFails.on = v; })} label="identity verification fails" live />
              <Stop on={rb.buyerRules.hardStops.fraudFinder.on} set={(v) => set((r) => { r.buyerRules.hardStops.fraudFinder.on = v; })} label="Fraud Finder risk ≥" live>
                <Num value={rb.buyerRules.hardStops.fraudFinder.threshold} min={1} max={100} disabled={!rb.buyerRules.hardStops.fraudFinder.on}
                  onChange={(v) => set((r) => { r.buyerRules.hardStops.fraudFinder.threshold = v; })} />
              </Stop>
              <Stop on={rb.buyerRules.hardStops.ofac.on} set={(v) => set((r) => { r.buyerRules.hardStops.ofac.on = v; })} label="OFAC / watch-list hit" />
              <Stop on={rb.buyerRules.hardStops.inactive.on} set={(v) => set((r) => { r.buyerRules.hardStops.inactive.on = v; })} label="business inactive" />
              <Stop on={rb.buyerRules.hardStops.registeredDays.on} set={(v) => set((r) => { r.buyerRules.hardStops.registeredDays.on = v; })} label="registered less than">
                <Num value={rb.buyerRules.hardStops.registeredDays.days} min={1} max={3650} suffix=" days ago" disabled={!rb.buyerRules.hardStops.registeredDays.on}
                  onChange={(v) => set((r) => { r.buyerRules.hardStops.registeredDays.days = v; })} />
              </Stop>
              <Stop on={rb.buyerRules.hardStops.lookAlike.on} set={(v) => set((r) => { r.buyerRules.hardStops.lookAlike.on = v; })} label="look-alike match in Quick Search" />
              <Stop on={rb.buyerRules.hardStops.mismatch.on} set={(v) => set((r) => { r.buyerRules.hardStops.mismatch.on = v; })} label="phone, address or EIN mismatch (Fraud Shields, reverse phone)" />
            </Group>
            <Group label="Evidence weights: how far each verdict moves trust (the deal bar)">
              <Slider label="Verified" value={rb.buyerRules.evidence.verified} min={0} max={30} sign="+" tone="good" onChange={(v) => set((r) => { r.buyerRules.evidence.verified = v; })} />
              <Slider label="Contradicted" value={rb.buyerRules.evidence.contradicted} min={0} max={50} sign="−" tone="bad" onChange={(v) => set((r) => { r.buyerRules.evidence.contradicted = v; })} />
              <Slider label="Unverified" value={rb.buyerRules.evidence.unverified} min={0} max={30} sign="−" tone="neutral" onChange={(v) => set((r) => { r.buyerRules.evidence.unverified = v; })} />
            </Group>
            <Group label="Escalate to a person when">
              <Toggle checked={rb.buyerRules.escalate.fraudAlert} onChange={(v) => set((r) => { r.buyerRules.escalate.fraudAlert = v; })} label="a fraud alert is on file" />
              <Toggle checked={rb.buyerRules.escalate.noDeal.on} onChange={(v) => set((r) => { r.buyerRules.escalate.noDeal.on = v; })} label="there's no deal after">
                <span className="inline"><Num value={rb.buyerRules.escalate.noDeal.rounds} min={1} max={6} suffix=" rounds" disabled={!rb.buyerRules.escalate.noDeal.on}
                  onChange={(v) => set((r) => { r.buyerRules.escalate.noDeal.rounds = v; })} /></span>
              </Toggle>
            </Group>
            <Group label="Approval">
              <p className="hint">{CONTRACTOR.controller} approves every deal. A second approver ({CONTRACTOR.secondApprover}) when the upfront payment is above</p>
              <Money cents={rb.buyerRules.approval.secondApproverAboveCents} onChange={(v) => set((r) => { r.buyerRules.approval.secondApproverAboveCents = v; })} />
            </Group>
          </Section>

          <Section n={4} title="Vendor agent rules" sub="Their side: the vendor's own agent. It argues, plays exhibits and concedes by these rules.">
            <TermsRow label="Opening ask" t={rb.vendorRules.opening} onChange={(t) => set((r) => { r.vendorRules.opening = t; })} />
            <TermsRow label="Walk-away point (worst terms it accepts)" t={rb.vendorRules.walkAway} onChange={(t) => set((r) => { r.vendorRules.walkAway = t; })} />
            <Group label="Negotiation style">
              <div className="group seg" role="group" aria-label="Style">
                {(["firm", "balanced", "flexible"] as const).map((s) => (
                  <button key={s} aria-pressed={rb.vendorRules.style === s} onClick={() => set((r) => { r.vendorRules.style = s; })}>{s[0].toUpperCase() + s.slice(1)}</button>
                ))}
              </div>
              <p className="hint">{rb.vendorRules.style === "firm" ? "Concedes slowly." : rb.vendorRules.style === "flexible" ? "Concedes fast." : "Meets halfway, upfront first and net days last."}</p>
            </Group>
            <Group label="Consent">
              <Toggle checked={rb.vendorRules.consent.allow} onChange={(v) => set((r) => { r.vendorRules.consent.allow = v; })}
                label="Allow sharing its own credit facts" hint="Its agent pulls its own TransUnion report and shares only these facts, if they help. The report stays face down." after={<LiveBadge />} />
              <div className="checks">
                {CREDIT_FACTS.map((f: CreditFact) => (
                  <label key={f} className={rb.vendorRules.consent.allow ? "" : "off"}>
                    <input type="checkbox" disabled={!rb.vendorRules.consent.allow} checked={rb.vendorRules.consent.facts.includes(f)}
                      onChange={(e) => set((r) => { r.vendorRules.consent.facts = e.target.checked ? [...r.vendorRules.consent.facts, f] : r.vendorRules.consent.facts.filter((x) => x !== f); })} />
                    {FACT_LABEL[f]}
                  </label>
                ))}
              </div>
            </Group>
            <Group label="Exhibits it may play">
              <div className="checks">
                {VENDOR_EXHIBITS.map((x: VendorExhibit) => (
                  <label key={x}>
                    <input type="checkbox" checked={rb.vendorRules.exhibits.includes(x)}
                      onChange={(e) => set((r) => { r.vendorRules.exhibits = e.target.checked ? [...r.vendorRules.exhibits, x] : r.vendorRules.exhibits.filter((k) => k !== x); })} />
                    {EXHIBIT_LABEL[x]}
                  </label>
                ))}
              </div>
              <p className="hint">Round 1: W-9 and license. Round 2: reference letter and credit facts. Round 3: invoices and bank letter. CRS has no source for invoices or bank letters, so they stay unverified.</p>
            </Group>
          </Section>
        </div>

        <Section n={5} title="General">
          <div className="general">
            <Group label="Max rounds">
              <Slider label="" value={rb.general.maxRounds} min={1} max={6} onChange={(v) => set((r) => { r.general.maxRounds = v; })} />
            </Group>
            <Group label="Agents' thoughts">
              <Toggle checked={rb.general.narrator} onChange={(v) => set((r) => { r.general.narrator = v; })} label="Show what each agent is thinking" />
            </Group>
            <Group label="Reset">
              <button className="btn" onClick={() => st().applyPreset("demo")}>Back to Demo default</button>
            </Group>
          </div>
        </Section>
        </details>

        <footer className="start-foot">
          <span className="foot-note"><b>{scenarioCase(rb).sub.business}</b> · {rb.preset === "custom" ? "custom rules" : PRESETS.find(([p]) => p === rb.preset)?.[1].toLowerCase()} · you'll hand in a W-9 during the duel</span>
          <button className="btn primary enter" onClick={() => st().enterRoom()} disabled={!ready}>{ready ? "Enter deal room" : "Setting the table…"}</button>
        </footer>
      </div>
    </div>
  );
}

function ScenarioCard({ id, rb }: { id: ScenarioId; rb: Rulebook }) {
  const sc = useMemo(() => scenarioCase(id === rb.scenario.id ? rb : switchScenario(rb, id)), [id, rb]);
  const owner = OWNERS.find((o) => o.persona === sc.owner)!;
  const on = rb.scenario.id === id;
  const st = useStore.getState;
  return (
    <div className={`scn${on ? " on" : ""}`} role="radio" aria-checked={on} tabIndex={0}
      onClick={() => { if (!on) st().pickScenario(id); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); st().pickScenario(id); } }}>
      <div className="scn-top"><span className="pid">{id}</span><b>{sc.sub.business}</b></div>
      <dl className="scn-info">
        <dt>Owner</dt><dd>{titleCase(owner.contact)} <span className="mono">{sc.owner}</span></dd>
        <dt>Trade</dt><dd>{sc.sub.trade}</dd>
        <dt>Would supply</dt><dd>{sc.sub.scope}</dd>
        <dt>Based in</dt><dd>{fmtAddress(sc.record.address).split(", ").slice(1).join(", ")}</dd>
        <dt>Says</dt><dd>in business since {sc.docs.licenseSince}</dd>
      </dl>
      {id === "E" && (
        <div className="scn-custom" onClick={(e) => e.stopPropagation()}>
          <label>Owner
            <select value={sc.owner} onChange={(e) => st().pickScenario("E", { owner: e.target.value })}>
              {OWNERS.map((o) => <option key={o.persona} value={o.persona}>{o.persona} {titleCase(o.contact)}</option>)}
            </select>
          </label>
          <label>Business
            <select value={sc.profile} onChange={(e) => st().pickScenario("E", { profile: e.target.value as BusinessProfileId })}>
              {PROFILES.map(([p, l]) => <option key={p} value={p}>{l}</option>)}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- small controls

function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="start-sec">
      <h2><span className="num">{n}</span>{title}</h2>
      {sub && <p className="hint">{sub}</p>}
      {children}
    </section>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return <div className="fgroup">{label && <div className="flabel">{label}</div>}{children}</div>;
}

function Num({ value, min, max, step = 1, prefix, suffix, disabled, onChange }: { value: number; min: number; max: number; step?: number; prefix?: string; suffix?: string; disabled?: boolean; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (s: string) => { setDraft(null); const n = Number(s); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, Math.round(n / step) * step))); };
  return (
    <span className={`num-field${disabled ? " off" : ""}`}>
      {prefix && <span className="affix">{prefix}</span>}
      <input type="number" inputMode="numeric" min={min} max={max} step={step} disabled={disabled} value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)} onBlur={(e) => commit(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit((e.target as HTMLInputElement).value); }} />
      {suffix && <span className="affix">{suffix}</span>}
    </span>
  );
}

const Money = ({ cents, onChange, disabled }: { cents: number; onChange: (c: number) => void; disabled?: boolean }) => (
  <Num value={cents / 100} min={0} max={500_000} step={1_000} prefix="$" disabled={disabled} onChange={(v) => onChange(v * 100)} />
);

function TermsRow({ label, t, onChange }: { label: string; t: Terms; onChange: (t: Terms) => void }) {
  return (
    <Group label={label}>
      <div className="terms-row">
        <label>Net days <Num value={t.netDays} min={15} max={60} step={5} prefix="net " onChange={(v) => onChange({ ...t, netDays: v })} /></label>
        <label>Upfront <Num value={t.upfrontPct} min={0} max={30} step={5} suffix="%" onChange={(v) => onChange({ ...t, upfrontPct: v })} /></label>
        <label>First-order limit <Money cents={t.limitCents} onChange={(v) => onChange({ ...t, limitCents: v })} /></label>
      </div>
    </Group>
  );
}

function Toggle({ checked, onChange, label, hint, after, children }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; after?: ReactNode; children?: ReactNode }) {
  return (
    <div className="toggle">
      <label><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>
      {children}
      {after}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

function Stop({ on, set, label, live, children }: { on: boolean; set: (v: boolean) => void; label: string; live?: boolean; children?: ReactNode }) {
  return (
    <div className="toggle stop">
      <label><input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /><span>{label}</span></label>
      {children}
      {live && <LiveBadge />}
    </div>
  );
}

function Slider({ label, value, min, max, sign = "", tone, onChange }: { label: string; value: number; min: number; max: number; sign?: string; tone?: string; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      {label && <span className="sl-label">{label}</span>}
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <b className={tone ? `tone-${tone}` : undefined}>{sign}{value}</b>
    </label>
  );
}
