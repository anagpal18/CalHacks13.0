// App state: the start page's Rulebook, which negotiation is on the table, the event playback, what's selected,
// where the camera goes. Events come from the engine running in the browser (the offline adapter: same engine,
// same rules), or from the deal API's stream when VITE_API_URL is set.

import { create } from "zustand";
import { DEAL_EVENT_TYPES, type DealEvent, type DealEventType, type Rulebook, type ScenarioId, type UploadedW9 } from "@terms-room/shared";
import { approveDeal, CONTRACTOR, normalizeRulebook, rulebookFor, runNegotiation, switchScenario, type Negotiation, type PresetId } from "@terms-room/api/negotiation";
import { derive, EMPTY, HOLD_MS, type TableState } from "./derive";
import { VIEWS, type ViewId } from "../scene/layout";
import { setSoundEnabled, sfx } from "../sound";

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || null;

export type SpotId = "report" | "consent" | "log" | "whiteboard" | "policy" | "gauge" | "dealbar" | "agent-contractor" | "agent-sub"
  | "dossier" | "contract" | "window" | "receipt" | "phone";
export type Selection = { kind: "card"; id: string } | { kind: "offer"; index: number } | { kind: "spot"; id: SpotId; persona?: string }
  | { kind: "call"; callId: string; field?: string } | { kind: "exhibit"; id: string };
export type Tab = "transcript" | "console" | "rulebook";

type Vec3 = [number, number, number];

interface Store {
  screen: "start" | "room";
  rulebook: Rulebook; // what the start page is editing; the running deal carries its own copy
  source: "local" | "api";
  persona: string;
  events: DealEvent[];
  times: number[];
  played: number;
  playing: boolean;
  speed: number;
  table: TableState;
  neg: Negotiation | null;
  apiId: string | null;
  busy: boolean;
  error: string | null;
  selection: Selection | null;
  hover: string | null;
  tab: Tab;
  focusCall: { callId: string; field?: string; at: number } | null;
  sceneReady: boolean; // the first 3D frame has drawn; the loading screen stays up until then
  cam: { pos: Vec3; target: Vec3; nonce: number };
  view: ViewId | null;
  sound: boolean;
  quality: "high" | "fast";
  setRulebook: (f: (r: Rulebook) => void) => void;
  applyPreset: (p: PresetId) => void;
  pickScenario: (id: ScenarioId, custom?: { owner?: string; profile?: Rulebook["scenario"]["profile"] }) => void;
  enterRoom: () => void;
  backToStart: (custom?: { owner: string }) => void;
  start: () => Promise<void>;
  submitUpload: (w9: UploadedW9 | null) => Promise<void>;
  approve: () => Promise<void>;
  togglePlay: () => void;
  step: () => void;
  seek: (index: number) => void;
  select: (s: Selection | null) => void;
  setTab: (t: Tab) => void;
  openCall: (callId: string, field?: string) => void;
  setView: (v: ViewId) => void;
  flyTo: (pos: Vec3, target: Vec3) => void;
  setSound: (on: boolean) => void;
  setQuality: (q: "high" | "fast") => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let runSeq = 0; // a newer start() wins; an older one that resolves late is dropped
let stream: EventSource | null = null;
let pendingUpload: ((w9: UploadedW9 | null) => void) | null = null;

const SAVED = "bursar.rulebook.v1";
function loadRulebook(): Rulebook {
  try {
    const raw = localStorage.getItem(SAVED);
    if (raw) return normalizeRulebook(JSON.parse(raw));
  } catch { /* private window or blocked storage: start from the default */ }
  return rulebookFor("A");
}
function saveRulebook(r: Rulebook) {
  try { localStorage.setItem(SAVED, JSON.stringify(r)); } catch { /* not essential */ }
}

const SOUND_FOR: Partial<Record<DealEventType, () => void>> = {
  card_landed: sfx.flick, offer_made: sfx.slide, offer_rejected: sfx.reject, tier_changed: sfx.tick, exhibit_played: sfx.slide,
  rule_applied: sfx.tick, deal_closed: sfx.chime, talks_ended: sfx.end, escalated: sfx.reject, approved: sfx.stamp, deposit_paid: sfx.print, report_held: sfx.slide,
};

export const useStore = create<Store>((set, get) => {
  const schedule = () => {
    if (timer) return;
    const { playing, played, events, speed } = get();
    if (!playing || played >= events.length) return;
    const prev = events[played - 1];
    const wait = played === 0 ? 450 : HOLD_MS[prev.type] / speed;
    timer = setTimeout(() => {
      timer = null;
      const s = get();
      if (!s.playing || s.played >= s.events.length) return;
      advance();
      schedule();
    }, wait);
  };

  const advance = () => {
    const s = get();
    const times = s.times.slice();
    times[s.played] = performance.now();
    const played = s.played + 1;
    set({ played, times, table: derive(s.events, played, times) });
    SOUND_FOR[s.events[s.played].type]?.();
  };

  const append = (es: DealEvent[]) => {
    set((s) => ({ events: [...s.events, ...es] }));
    schedule();
  };

  const reset = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    stream?.close(); stream = null;
    // A run waiting on the W-9 would otherwise hang forever (and keep busy set); let it finish unseen.
    const waiting = pendingUpload;
    pendingUpload = null;
    waiting?.(null);
    set({ events: [], times: [], played: 0, table: EMPTY, neg: null, apiId: null, error: null, selection: null, playing: true, focusCall: null, tab: "transcript", busy: false });
  };

  const initial = loadRulebook();
  return {
    screen: "start",
    rulebook: initial,
    source: API ? "api" : "local",
    persona: initial.scenario.owner,
    events: [], times: [], played: 0, playing: true, speed: initial.general.speed, table: EMPTY,
    neg: null, apiId: null, busy: false, error: null, selection: null, hover: null, tab: "transcript", focusCall: null, sceneReady: false,
    cam: { ...VIEWS.overview, nonce: 0 }, view: "overview",
    sound: true, quality: "high",

    setRulebook(f) {
      const r = structuredClone(get().rulebook);
      f(r);
      r.preset = "custom";
      const n = normalizeRulebook(r);
      saveRulebook(n);
      set({ rulebook: n });
    },
    applyPreset(p) {
      const cur = get().rulebook;
      const r = rulebookFor(cur.scenario.id, p, { owner: cur.scenario.owner, profile: cur.scenario.profile });
      saveRulebook(r);
      set({ rulebook: r });
    },
    pickScenario(id, custom) {
      // Keep the rules the judge already set; switch only the story (and that story's consent default).
      const r = switchScenario(structuredClone(get().rulebook), id, custom);
      saveRulebook(r);
      set({ rulebook: r });
    },
    /** Into the room, table cleared. The story waits for the Start button. */
    enterRoom() {
      runSeq++;
      reset();
      set({ screen: "room", speed: get().rulebook.general.speed, persona: get().rulebook.scenario.owner });
      get().setView("overview");
    },
    backToStart(custom) {
      runSeq++;
      reset();
      if (custom) get().pickScenario("E", { owner: custom.owner });
      set({ screen: "start", playing: false });
    },

    async start() {
      const rb = normalizeRulebook(get().rulebook);
      const my = ++runSeq;
      reset();
      set({ busy: true, persona: rb.scenario.owner, speed: rb.general.speed });
      get().setView("overview");
      try {
        if (!API) {
          const judge = () => new Promise<UploadedW9 | null>((resolve) => { pendingUpload = resolve; });
          const neg = await runNegotiation(rb, { judge, emit: (e) => { if (my === runSeq) append([e]); } });
          if (my !== runSeq) return;
          set({ neg });
        } else {
          const r = await fetch(`${API}/deals`, { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ scenario: rb.scenario, buyerRules: rb.buyerRules, vendorRules: rb.vendorRules, general: rb.general, preset: rb.preset }) });
          const body = await r.json();
          if (!r.ok) throw new Error(body.error ?? `Deal API answered ${r.status}`);
          if (my !== runSeq) return;
          set({ apiId: body.negotiationId });
          stream = new EventSource(`${API}/deals/${body.negotiationId}/stream`);
          for (const t of DEAL_EVENT_TYPES) stream.addEventListener(t, (m) => append([JSON.parse((m as MessageEvent).data)]));
          stream.onerror = () => set({ error: "Lost the deal stream. The API may have restarted." });
        }
      } catch (err) {
        if (my === runSeq) set({ error: (err as Error).message });
      } finally {
        if (my === runSeq) set({ busy: false });
      }
    },

    async submitUpload(w9) {
      const { apiId } = get();
      try {
        if (API && apiId) {
          const r = await fetch(`${API}/deals/${apiId}/exhibit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ w9 }) });
          if (!r.ok) throw new Error((await r.json()).error);
        } else if (pendingUpload) {
          const resolve = pendingUpload;
          pendingUpload = null;
          resolve(w9);
        }
      } catch (err) { set({ error: (err as Error).message }); }
    },

    async approve() {
      const { neg, apiId, table } = get();
      const approvers = (table.closed?.approversNeeded ?? 1) > 1 ? [CONTRACTOR.controller, CONTRACTOR.secondApprover] : [CONTRACTOR.controller];
      try {
        if (API && apiId) {
          const r = await fetch(`${API}/deals/${apiId}/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ approvers }) });
          if (!r.ok) throw new Error((await r.json()).error);
        } else if (neg) {
          append(approveDeal(neg, approvers));
        }
      } catch (err) { set({ error: (err as Error).message }); }
    },

    togglePlay() {
      const playing = !get().playing;
      if (!playing && timer) { clearTimeout(timer); timer = null; }
      set({ playing });
      if (playing) schedule();
    },
    step() {
      if (timer) { clearTimeout(timer); timer = null; }
      set({ playing: false });
      if (get().played < get().events.length) advance();
    },
    seek(index) {
      if (timer) { clearTimeout(timer); timer = null; }
      const { events } = get();
      const played = Math.max(0, Math.min(events.length, index + 1));
      const settled = performance.now() - 60_000;
      const times = events.slice(0, played).map((_, i) => (i === played - 1 ? performance.now() : settled));
      set({ played, times, table: derive(events, played, times), selection: null });
      if (get().playing) schedule();
    },
    select(selection) { set({ selection }); },
    setTab(tab) { set({ tab }); },
    openCall(callId, field) { set({ tab: "console", focusCall: { callId, field, at: performance.now() }, selection: { kind: "call", callId, field } }); },
    setView(view) { set({ view, cam: { ...VIEWS[view], nonce: get().cam.nonce + 1 } }); },
    flyTo(pos, target) { set({ view: null, cam: { pos, target, nonce: get().cam.nonce + 1 } }); },
    setSound(sound) { setSoundEnabled(sound); set({ sound }); },
    setQuality(quality) { set({ quality }); },
  };
});
