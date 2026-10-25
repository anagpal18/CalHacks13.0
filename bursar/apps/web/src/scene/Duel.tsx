// The document duel on the table.
//   Exhibits: a document the vendor (or you) plays rises up in front of the camera so it can be read, gets a mark
//   beside each claim as CRS checks it, then settles back down onto the vendor's side of the table.
//   Threads: every contradiction strings a red thread from the claim to the CRS card that contradicts it.
//   Thoughts: a bubble over each agent says what it's thinking, typed out as it happens.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useStore } from "../state/store";
import type { PlayedExhibit } from "../state/derive";
import { mats } from "./materials";
import { AGENT_X, CARD, EXHIBIT, TABLE, exhibitPosition, slotPosition } from "./layout";
import { exhibitSheet, INK } from "./textures";
import { HIDDEN_CAPS, clamp01, easeInOut, easeOutCubic, flatFace, sheetEdge } from "./geo";
import { useClickable } from "./interact";
import { PAPER } from "./Pieces";
import { thought } from "../ui/narrate";

const FLIGHT_MS = 950;
const HOLD_AFTER_MS = 1800; // how long a document stays up after its last claim is checked
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };

let shared: { face: THREE.BufferGeometry; edge: THREE.BufferGeometry } | null = null;
const geos = () => (shared ??= { face: flatFace(EXHIBIT.w, EXHIBIT.h, 0.004), edge: sheetEdge(EXHIBIT.w, EXHIBIT.h, 0.004, 0.0008) });

// Facing the camera: the sheet's face (+y) toward the viewer and its top (-z) up.
const FACE_CAMERA = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const tmp = { fwd: new THREE.Vector3(), present: new THREE.Vector3(), q: new THREE.Quaternion(), table: new THREE.Quaternion(), e: new THREE.Euler() };

function ExhibitSheet({ px, doneAt, latest }: { px: PlayedExhibit; doneAt: number | null; latest: boolean }) {
  const g = geos();
  const m = mats();
  const ref = useRef<THREE.Group>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const lift = useRef(0);
  const n = px.checks.length;
  const tex = useMemo(() => exhibitSheet(px.exhibit, px.checks), [px.exhibit, n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => tex.dispose(), [tex]);
  const [x, y, z] = exhibitPosition(px.index - 1);
  const yaw = -0.08 + (hash(px.exhibit.id) - 0.5) * 0.16;
  const selected = useStore((s) => s.selection?.kind === "exhibit" && s.selection.id === px.exhibit.id);
  const label = `${px.exhibit.label}: ${px.exhibit.title}${px.exhibit.from === "judge" ? " (yours)" : ""}`;
  const { handlers, hovered } = useClickable(label, { kind: "exhibit", id: px.exhibit.id }, { pos: [x, TABLE.top + 0.45, z + 0.32], target: [x, TABLE.top, z] });
  useFrame((state, dt) => {
    const now = performance.now();
    const ended = useStore.getState().table.ended;
    const presenting = latest && !ended && (doneAt === null || now < doneAt + HOLD_AFTER_MS);
    const was = lift.current;
    lift.current += ((presenting ? 1 : 0) - lift.current) * (1 - Math.exp(-dt * 3.6));
    // It moved out from under a resting pointer: drop its hover label.
    if (was >= 0.5 && lift.current < 0.5 && useStore.getState().hover === label) useStore.setState({ hover: null });
    const p = easeInOut(lift.current);

    // On the table: flies in from whoever handed it over, then lies flat.
    const t = clamp01((now - px.at) / FLIGHT_MS);
    const e = easeOutCubic(t);
    const from = px.exhibit.from === "judge" ? [0.4, TABLE.top + 0.5, 0.75] : [AGENT_X, TABLE.top + 0.14, 0.05];
    const hoverLift = selected ? 0.05 : hovered ? 0.012 : 0;
    const tx = THREE.MathUtils.lerp(from[0], x, e), ty = THREE.MathUtils.lerp(from[1], y, e) + Math.sin(Math.PI * e) * 0.12 + hoverLift, tz = THREE.MathUtils.lerp(from[2], z, e);
    tmp.table.setFromEuler(tmp.e.set(selected ? 0.42 : 0, THREE.MathUtils.lerp(0.9, yaw, easeInOut(t)), 0));

    // Presented: in front of the camera, big enough to read (about 60% of the view's height).
    const cam = state.camera as THREE.PerspectiveCamera;
    const d = EXHIBIT.h / (0.6 * 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    tmp.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    tmp.present.copy(cam.position).addScaledVector(tmp.fwd, d);
    tmp.q.copy(cam.quaternion).multiply(FACE_CAMERA);

    ref.current.position.set(tx, ty, tz).lerp(tmp.present, p);
    ref.current.quaternion.copy(tmp.table).slerp(tmp.q, p);
    mat.current.emissiveIntensity = (hovered || selected ? 0.04 : 0) + p * 0.32;
  });
  return (
    <group ref={ref} {...handlers}>
      <mesh geometry={g.edge} castShadow receiveShadow material={[HIDDEN_CAPS, m.paperEdge]} />
      <mesh geometry={g.face} position-y={0.0005} receiveShadow>
        <meshStandardMaterial ref={mat} key={n} map={tex} color={PAPER} roughness={0.85} emissive="#ffffff" emissiveIntensity={0} emissiveMap={tex} />
      </mesh>
    </group>
  );
}

export function Exhibits() {
  const exhibits = useStore((s) => s.table.exhibits);
  const checks = useStore((s) => s.table.checks);
  const nid = useStore((s) => s.table.negotiationId);
  const papers = exhibits.filter((x) => x.exhibit.kind !== "statement");
  const last = papers.at(-1)?.exhibit.id;
  return (
    <group key={nid}>
      {papers.map((px) => {
        const mine = checks.filter((c) => c.check.exhibitId === px.exhibit.id);
        const doneAt = mine.length >= px.exhibit.claims.length && mine.length ? Math.max(...mine.map((c) => c.at)) : null;
        return <ExhibitSheet key={px.exhibit.id} px={px} doneAt={doneAt} latest={px.exhibit.id === last} />;
      })}
    </group>
  );
}

// ---------------------------------------------------------------- red threads

const THREAD_MS = 800;
type V3 = [number, number, number];

function Thread({ from, to, at }: { from: V3; to: V3; at: number }) {
  const key = `${from.join()}|${to.join()}`;
  const geo = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const mid = a.clone().lerp(b, 0.5);
    mid.y = Math.max(a.y, b.y) + 0.06 + a.distanceTo(b) * 0.05;
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 64, 0.0017, 6, false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geo.dispose(), [geo]);
  const ref = useRef<THREE.Group>(null!);
  const pinB = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const st = useStore.getState().table;
    const gone = !!st.ended && performance.now() > st.ended.at + 250;
    ref.current.visible = !gone;
    const t = easeOutCubic((performance.now() - at) / THREAD_MS);
    const count = geo.index ? geo.index.count : 0;
    geo.setDrawRange(0, Math.floor((count * t) / 36) * 36);
    pinB.current.visible = t >= 1;
  });
  return (
    <group ref={ref}>
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial color={INK.bad} emissive="#b3261e" emissiveIntensity={0.35} roughness={0.55} />
      </mesh>
      <mesh position={from}><sphereGeometry args={[0.0065, 14, 10]} /><meshStandardMaterial color="#c3262d" roughness={0.3} metalness={0.1} /></mesh>
      <mesh ref={pinB} position={to}><sphereGeometry args={[0.0065, 14, 10]} /><meshStandardMaterial color="#c3262d" roughness={0.3} metalness={0.1} /></mesh>
    </group>
  );
}

/** One thread per contradicted claim, from the exhibit (or the vendor's seat, for its opening statement) to the card. */
export function Threads() {
  const checks = useStore((s) => s.table.checks);
  const cards = useStore((s) => s.table.cards);
  const exhibits = useStore((s) => s.table.exhibits);
  const nid = useStore((s) => s.table.negotiationId);
  const threads = useMemo(() => {
    const out: { key: string; from: V3; to: V3; at: number }[] = [];
    checks.forEach(({ check: c, at }, i) => {
      if (c.verdict !== "contradicted") return;
      const pc = cards.find((x) => c.cardIds.includes(x.card.id));
      const px = exhibits.find((x) => x.exhibit.id === c.exhibitId);
      if (!pc || !px) return;
      const [cx, cz] = slotPosition(pc.card.side, pc.slot);
      const to: V3 = [cx + 0.03, TABLE.top + CARD.t + 0.006, cz - CARD.h * 0.3];
      let from: V3;
      if (px.exhibit.kind === "statement") {
        from = [AGENT_X - 0.06, TABLE.top + 0.118, -0.02 + (i % 4) * 0.012];
      } else {
        const [ex, ey, ez] = exhibitPosition(px.index - 1);
        const row = Math.max(0, px.exhibit.claims.findIndex((k) => k.id === c.claimId));
        from = [ex - EXHIBIT.w * 0.4, ey + 0.004, ez + EXHIBIT.h * (0.15 + row * 0.05)];
      }
      out.push({ key: `${c.claimId}-${i}`, from, to, at });
    });
    return out;
  }, [checks, cards, exhibits]);
  return <group key={nid}>{threads.map((t) => <Thread key={t.key} from={t.from} to={t.to} at={t.at} />)}</group>;
}

// ---------------------------------------------------------------- what each agent is thinking

function useTyped(text: string, cps: number) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    if (!text) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.max(0, Math.min(text.length, Math.floor(((performance.now() - t0 - 380) / 1000) * cps)));
      setN(k);
      if (k < text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, cps]);
  return { shown: text.slice(0, n), thinking: !!text && n === 0, typing: n > 0 && n < text.length };
}

function Bubble({ side, text, active, speed }: { side: "contractor" | "sub"; text: string; active: boolean; speed: number }) {
  const { shown, thinking, typing } = useTyped(text, 70 * speed);
  const x = side === "contractor" ? -AGENT_X : AGENT_X;
  return (
    <Html position={[x, TABLE.top + 0.2, 0]} zIndexRange={[4, 0]} style={{ pointerEvents: "none" }}>
      <div className={`thought ${side}${active ? " active" : ""}`}>
        <span className="who">{side === "contractor" ? "Our agent" : "Vendor's agent"}{active ? " · thinking" : ""}</span>
        <p>{thinking ? <span className="dots"><i /><i /><i /></span> : <>{shown}{typing && <span className="caret" />}</>}</p>
      </div>
    </Html>
  );
}

export function Thoughts() {
  const events = useStore((s) => s.events);
  const played = useStore((s) => s.played);
  const speed = useStore((s) => s.speed);
  const on = useStore((s) => s.table.rulebook?.general.narrator ?? true);
  const screen = useStore((s) => s.screen);
  const latest = useMemo(() => {
    const out: { contractor?: { text: string; i: number }; sub?: { text: string; i: number } } = {};
    for (let i = played - 1; i >= 0 && !(out.contractor && out.sub); i--) {
      const t = thought(events[i]);
      if (t && !out[t.side]) out[t.side] = { text: t.text, i };
    }
    return out;
  }, [events, played]);
  if (!on || screen !== "room") return null;
  const active = (latest.contractor?.i ?? -1) > (latest.sub?.i ?? -1) ? "contractor" : "sub";
  return (
    <>
      {latest.contractor && <Bubble side="contractor" text={latest.contractor.text} active={active === "contractor"} speed={speed} />}
      {latest.sub && <Bubble side="sub" text={latest.sub.text} active={active === "sub"} speed={speed} />}
    </>
  );
}
