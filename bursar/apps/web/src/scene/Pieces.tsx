// The moving paper: CRS cards that fly in from each agent and flip face up, offer slips that slide to the middle,
// and the scatter when talks end.

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../state/store";
import { cardsOnShow, type PlayedCard, type PlayedOffer } from "../state/derive";
import { mats } from "./materials";
import { CARD, SLIP, TABLE, agentPos, slipPosition, slotPosition } from "./layout";
import { cardBack, cardFace, slip } from "./textures";
import { HIDDEN_CAPS, clamp01, easeInOut, easeOutCubic, flatBack, flatFace, sheetEdge } from "./geo";
import { useClickable } from "./interact";

const FLIGHT_MS = 950;
const FACE_CAMERA = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const tmp = { fwd: new THREE.Vector3(), right: new THREE.Vector3(), present: new THREE.Vector3(), q: new THREE.Quaternion(), table: new THREE.Quaternion() };
/** Real paper reflects about 85% of light; the canvases are drawn brighter than that. */
export const PAPER = "#dad7d0";
const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };

let shared: { face: THREE.BufferGeometry; back: THREE.BufferGeometry; edge: THREE.BufferGeometry; backMat: THREE.Material;
  slipFace: THREE.BufferGeometry; slipEdge: THREE.BufferGeometry } | null = null;
const geos = () => (shared ??= {
  face: flatFace(CARD.w, CARD.h, 0.007), back: flatBack(CARD.w, CARD.h, 0.007), edge: sheetEdge(CARD.w, CARD.h, 0.007, CARD.t),
  backMat: new THREE.MeshStandardMaterial({ map: cardBack(), roughness: 0.82 }),
  slipFace: flatFace(SLIP.w, SLIP.h, 0.003), slipEdge: sheetEdge(SLIP.w, SLIP.h, 0.003, 0.0006),
});

interface Body { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; w: THREE.Vector3; resting: boolean }

function stepBody(b: Body, dt: number) {
  if (b.resting) return;
  b.v.y -= 9.8 * dt;
  b.p.addScaledVector(b.v, dt);
  b.r.x += b.w.x * dt; b.r.y += b.w.y * dt; b.r.z += b.w.z * dt;
  const overTable = Math.abs(b.p.x) < TABLE.w / 2 - 0.02 && Math.abs(b.p.z) < TABLE.d / 2 - 0.02 && b.p.y > TABLE.top - 0.03;
  const floor = overTable ? TABLE.top + 0.001 : 0.012;
  if (b.p.y < floor) {
    b.p.y = floor;
    b.v.y = -b.v.y * 0.22;
    b.v.x *= 0.45; b.v.z *= 0.45; b.w.multiplyScalar(0.4);
    // settle flat, face up or face down, whichever is closer
    b.r.x = Math.round(b.r.x / Math.PI) * Math.PI;
    b.r.z = Math.round(b.r.z / Math.PI) * Math.PI;
    if (b.v.length() < 0.08) b.resting = true;
  }
}

/** show: this card is one of the CRS check's results on show (k of n), held up in front of the camera to be read. */
function CardMesh({ pc, index, show }: { pc: PlayedCard; index: number; show: { k: number; n: number } | null }) {
  const g = geos();
  const m = mats();
  const ref = useRef<THREE.Group>(null!);
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const raise = useRef(0);
  const layout = useRef({ k: 0, n: 1 });
  if (show) layout.current = show; // keep its place in the row while it settles back to the table
  const showing = useRef(false);
  showing.current = !!show;
  const faceTex = useMemo(() => cardFace(pc.card), [pc.card]);
  useEffect(() => () => faceTex.dispose(), [faceTex]);
  const [sx, sz] = slotPosition(pc.card.side, pc.slot);
  const from = agentPos(pc.card.side);
  const yaw = (hash(pc.card.id + pc.slot) - 0.5) * 0.12;
  const body = useRef<Body | null>(null);
  const selected = useStore((s) => s.selection?.kind === "card" && s.selection.id === pc.card.id);
  const { handlers, hovered } = useClickable(`${pc.card.title}: ${pc.card.headline}`, { kind: "card", id: pc.card.id },
    { pos: [sx, TABLE.top + 0.42, sz + 0.3], target: [sx, TABLE.top, sz] });

  useFrame((state, dt) => {
    const o = ref.current;
    const st = useStore.getState().table;
    if (st.ended && performance.now() > st.ended.at + 250) {
      if (!body.current) {
        const r = hash(pc.card.id + "s");
        const dir = new THREE.Vector3(o.position.x * 1.6 + (r - 0.5), 0, o.position.z * 1.4 + (hash(pc.card.id + "z") - 0.3)).normalize();
        body.current = { p: o.position.clone(), v: new THREE.Vector3(dir.x * (1.4 + r * 1.6), 1.4 + r * 1.5, dir.z * (0.9 + r * 1.2)),
          r: o.rotation.clone(), w: new THREE.Vector3((r - 0.5) * 18, (hash(pc.card.id + "w") - 0.5) * 14, (r - 0.2) * 16), resting: false };
      }
      const b = body.current;
      const steps = 3;
      for (let i = 0; i < steps; i++) stepBody(b, Math.min(dt, 0.05) / steps);
      o.position.copy(b.p); o.rotation.copy(b.r);
      return;
    }
    body.current = null;
    const t = clamp01((performance.now() - pc.at) / FLIGHT_MS);
    const e = easeOutCubic(t);
    const lift = selected ? 0.05 : hovered ? 0.012 : 0;
    o.position.set(
      THREE.MathUtils.lerp(from[0], sx, e),
      THREE.MathUtils.lerp(from[1], TABLE.top + CARD.t / 2 + 0.0004 + index * 0.00012, e) + Math.sin(Math.PI * e) * 0.3 + lift,
      THREE.MathUtils.lerp(from[2], sz, e),
    );
    o.rotation.set(selected ? 0.45 : 0, THREE.MathUtils.lerp(pc.card.side === "contractor" ? 1.2 : -1.2, yaw, e), (1 - easeInOut(t)) * Math.PI);

    // On show: up in front of the camera, side by side with the rest of its CRS check, big enough to read.
    raise.current += ((showing.current ? 1 : 0) - raise.current) * (1 - Math.exp(-dt * 4));
    const p = easeInOut(raise.current);
    mat.current.emissiveIntensity = (hovered || selected ? 0.04 : 0) + p * 0.3;
    if (p < 0.001) return;
    const cam = state.camera as THREE.PerspectiveCamera;
    const { k, n } = layout.current;
    const share = n <= 2 ? 0.42 : n === 3 ? 0.34 : 0.27; // of the view's height
    const d = CARD.h / (share * 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    tmp.fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    tmp.right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    tmp.present.copy(cam.position).addScaledVector(tmp.fwd, d).addScaledVector(tmp.right, (k - (n - 1) / 2) * CARD.w * 1.12);
    tmp.q.copy(cam.quaternion).multiply(FACE_CAMERA);
    tmp.table.copy(o.quaternion);
    o.position.lerp(tmp.present, p);
    o.quaternion.copy(tmp.table).slerp(tmp.q, p);
  });

  return (
    <group ref={ref} position={from} {...handlers}>
      <mesh geometry={g.edge} castShadow receiveShadow material={[HIDDEN_CAPS, m.paperEdge]} />
      <mesh geometry={g.face} position-y={CARD.t / 2 + 0.00015} receiveShadow>
        <meshStandardMaterial ref={mat} map={faceTex} color={PAPER} roughness={0.8} emissive="#ffffff" emissiveIntensity={hovered || selected ? 0.04 : 0} emissiveMap={faceTex} />
      </mesh>
      <mesh geometry={g.back} position-y={-CARD.t / 2 - 0.00015} material={g.backMat} />
    </group>
  );
}

export function Cards() {
  const cards = useStore((s) => s.table.cards);
  const nid = useStore((s) => s.table.negotiationId);
  const onShow = useStore((s) => cardsOnShow(s.events, s.played));
  const first = cards.length - onShow;
  return <group key={nid}>{cards.map((pc, i) => (
    <CardMesh key={`${pc.card.id}-${pc.slot}`} pc={pc} index={i} show={i >= first ? { k: i - first, n: onShow } : null} />))}</group>;
}

// ---------------------------------------------------------------- offer slips

function SlipMesh({ po }: { po: PlayedOffer }) {
  const g = geos();
  const m = mats();
  const ref = useRef<THREE.Group>(null!);
  const tex = useMemo(() => slip(po.offer, po.rejected, po.reasons), [po]);
  useEffect(() => () => tex.dispose(), [tex]);
  const side = po.offer.from;
  const from = agentPos(side);
  const land = slipPosition(po.index, side, false);
  const reject = slipPosition(po.index, side, true);
  const yaw = (side === "contractor" ? 0.1 : -0.1) + (hash(`${po.index}`) - 0.5) * 0.14;
  const body = useRef<Body | null>(null);
  const selected = useStore((s) => s.selection?.kind === "offer" && s.selection.index === po.index);
  const { handlers, hovered } = useClickable(`Round ${po.offer.round}, ${side === "sub" ? "vendor asks" : "we offer"}: paid in ${po.offer.netDays} days, ${po.offer.depositPct}% up front${po.rejected ? " (rules said no)" : ""}`,
    { kind: "offer", index: po.index }, { pos: [land[0], TABLE.top + 0.42, land[2] + 0.3], target: [land[0], TABLE.top, land[2]] });

  useFrame((_, dt) => {
    const o = ref.current;
    const st = useStore.getState().table;
    if (st.ended && performance.now() > st.ended.at + 250) {
      if (!body.current) body.current = { p: o.position.clone(), v: new THREE.Vector3((hash(`${po.index}x`) - 0.5) * 2, 1.2, 1.1), r: o.rotation.clone(), w: new THREE.Vector3(3, 6, 2), resting: false };
      for (let i = 0; i < 3; i++) stepBody(body.current, Math.min(dt, 0.05) / 3);
      o.position.copy(body.current.p); o.rotation.copy(body.current.r);
      return;
    }
    const age = performance.now() - po.at;
    const e = easeOutCubic(age / 900);
    let x = THREE.MathUtils.lerp(from[0], land[0], e), z = THREE.MathUtils.lerp(from[2] + 0.2, land[2], e);
    let y = TABLE.top + 0.012 + (land[1] - TABLE.top) + Math.sin(Math.PI * e) * 0.035;
    let ry = THREE.MathUtils.lerp(side === "contractor" ? -0.8 : 0.8, yaw, e);
    if (po.rejected) {
      const back = easeInOut((age - 1300) / 700);
      x = THREE.MathUtils.lerp(x, reject[0], back); z = THREE.MathUtils.lerp(z, reject[2], back);
      y = THREE.MathUtils.lerp(y, reject[1] + 0.012 - 0.0006, back);
      ry += back * (side === "contractor" ? 0.35 : -0.35);
    }
    o.position.set(x, y - 0.011 + (selected ? 0.05 : hovered ? 0.01 : 0), z);
    o.rotation.set(selected ? 0.5 : 0, ry, 0);
  });

  return (
    <group ref={ref} position={from} {...handlers}>
      <mesh geometry={g.slipEdge} castShadow receiveShadow material={[HIDDEN_CAPS, m.paperEdge]} />
      <mesh geometry={g.slipFace} position-y={0.00035} receiveShadow><meshStandardMaterial map={tex} color={PAPER} roughness={0.85} /></mesh>
    </group>
  );
}

export function Slips() {
  const offers = useStore((s) => s.table.offers);
  const nid = useStore((s) => s.table.negotiationId);
  return <group key={nid}>{offers.slice(-8).map((po) => <SlipMesh key={po.index} po={po} />)}</group>;
}
