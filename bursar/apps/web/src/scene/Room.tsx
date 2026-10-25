// The site office: concrete floor, window wall onto the job site, credenza with the sub dossiers,
// whiteboard and policy plaque on the accent wall, six chairs around the walnut table.

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { OWNERS, TIER_NAME, rulebookFor, scenarioCase, tierLine } from "@terms-room/api/negotiation";
import { fmtUsd } from "@terms-room/shared";
import { useStore } from "../state/store";
import { mats } from "./materials";
import { ROOM, VIEWS } from "./layout";
import { clockFace, folderTab, plaque, receipt, sitePlan, whiteboard, type BoardRow, INK } from "./textures";
import { useClickable } from "./interact";
import { uprightFace } from "./geo";

const W = ROOM.x * 2, D = ROOM.zFront - ROOM.zBack, H = ROOM.h;
const midZ = (ROOM.zFront + ROOM.zBack) / 2;

export function Shell() {
  const m = mats();
  const bays = [-4.5, -2.25, 0, 2.25, 4.5];
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, midZ]} receiveShadow material={m.floor}>
        <planeGeometry args={[W, D]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.006, -0.05]} receiveShadow material={m.rug}>
        <planeGeometry args={[4.9, 3.0]} />
      </mesh>
      <mesh rotation-x={Math.PI / 2} position={[0, H, midZ]} material={m.ceiling}>
        <planeGeometry args={[W, D]} />
      </mesh>
      {/* window wall: sill, header and end piers around four glazed bays */}
      <mesh position={[0, 0.375, ROOM.zBack - 0.1]} castShadow receiveShadow material={m.wall}><boxGeometry args={[W, 0.75, 0.2]} /></mesh>
      <mesh position={[0, 2.85, ROOM.zBack - 0.1]} castShadow receiveShadow material={m.wall}><boxGeometry args={[W, 0.3, 0.2]} /></mesh>
      {[-4.75, 4.75].map((x) => (
        <mesh key={x} position={[x, 1.725, ROOM.zBack - 0.1]} castShadow receiveShadow material={m.wall}><boxGeometry args={[0.5, 1.95, 0.2]} /></mesh>
      ))}
      <mesh position={[0, 1.725, ROOM.zBack - 0.06]} material={m.glass}><planeGeometry args={[9, 1.95]} /></mesh>
      {bays.map((x) => (
        <mesh key={x} position={[x, 1.725, ROOM.zBack - 0.06]} castShadow material={m.mullion}><boxGeometry args={[0.06, 1.95, 0.12]} /></mesh>
      ))}
      {[0.78, 2.2, 2.68].map((y) => (
        <mesh key={y} position={[0, y, ROOM.zBack - 0.06]} castShadow material={m.mullion}><boxGeometry args={[9, 0.05, 0.12]} /></mesh>
      ))}
      <mesh position={[0, 0.77, ROOM.zBack + 0.06]} castShadow receiveShadow material={m.whiteMatte}><boxGeometry args={[9.2, 0.04, 0.26]} /></mesh>
      {/* side and front walls */}
      <mesh position={[-ROOM.x - 0.1, H / 2, midZ]} receiveShadow material={m.wall}><boxGeometry args={[0.2, H, D]} /></mesh>
      <mesh position={[ROOM.x + 0.1, H / 2, midZ]} receiveShadow material={m.accentWall}><boxGeometry args={[0.2, H, D]} /></mesh>
      <mesh position={[0, H / 2, ROOM.zFront + 0.1]} receiveShadow material={m.wall}><boxGeometry args={[W, H, 0.2]} /></mesh>
      <Door />
      {/* baseboards */}
      {[[-ROOM.x + 0.01, midZ, 0.02, D] as const, [ROOM.x - 0.01, midZ, 0.02, D] as const].map(([x, z, w, d]) => (
        <mesh key={x} position={[x, 0.05, z]} material={m.blackSteel}><boxGeometry args={[w, 0.1, d]} /></mesh>
      ))}
      <Pendants />
      <Plant position={[-4.4, 0, -3.05]} scale={1.15} />
      <Plant position={[4.35, 0, -3.1]} scale={1} />
    </group>
  );
}

function Door() {
  const m = mats();
  return (
    <group position={[-3.2, 0, ROOM.zFront - 0.01]}>
      <mesh position={[0, 1.05, 0]} material={m.walnutDark}><boxGeometry args={[0.95, 2.1, 0.05]} /></mesh>
      <mesh position={[0.36, 1.02, -0.05]} material={m.steel}><boxGeometry args={[0.14, 0.02, 0.04]} /></mesh>
      <mesh position={[0, 1.05, 0.02]} material={m.mullion}><boxGeometry args={[1.05, 2.18, 0.03]} /></mesh>
    </group>
  );
}

/** Two linear pendants over the table. The lights themselves are in Lighting; these are the fixtures. */
function Pendants() {
  const m = mats();
  const status = useStore((s) => s.table.status);
  const strip = useRef<THREE.MeshStandardMaterial>(null!);
  const target = useMemo(() => new THREE.Color(), []);
  useFrame((_, dt) => {
    target.set(status === "ended" ? "#ff3b2a" : status === "escalated" ? "#ffb23a" : "#ffe2b8");
    strip.current.emissive.lerp(target, 1 - Math.exp(-dt * 3));
  });
  return (
    <group>
      {[-0.7, 0.7].map((x) => (
        <group key={x} position={[x, 2.62, -0.05]}>
          <mesh position={[0, 0.19, 0]} material={m.blackSteel}><cylinderGeometry args={[0.003, 0.003, 0.38, 6]} /></mesh>
          <mesh material={m.blackSteel} castShadow><boxGeometry args={[1.25, 0.045, 0.1]} /></mesh>
          <mesh position={[0, -0.024, 0]}>
            <boxGeometry args={[1.2, 0.004, 0.07]} />
            <meshStandardMaterial ref={strip} color="#222" emissive="#ffe2b8" emissiveIntensity={3.2} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Plant({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const m = mats();
  const leaves = useMemo(() => {
    const out: { p: [number, number, number]; r: [number, number, number]; s: number }[] = [];
    for (let i = 0; i < 26; i++) {
      const a = i * 2.399, h = 0.55 + (i / 26) * 0.75;
      out.push({ p: [Math.cos(a) * 0.12, h, Math.sin(a) * 0.12], r: [Math.cos(a) * 0.9, a, Math.sin(a) * 0.9], s: 0.7 + ((i * 7) % 5) / 10 });
    }
    return out;
  }, []);
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.22, 0]} castShadow receiveShadow material={m.pot}><cylinderGeometry args={[0.2, 0.16, 0.44, 24]} /></mesh>
      <mesh position={[0, 0.45, 0]} material={m.blackSteel}><cylinderGeometry args={[0.012, 0.016, 0.8, 6]} /></mesh>
      {leaves.map((l, i) => (
        <mesh key={i} position={l.p} rotation={l.r} scale={[0.09 * l.s, 0.012, 0.22 * l.s]} castShadow material={m.plant}>
          <sphereGeometry args={[1, 10, 6]} />
        </mesh>
      ))}
    </group>
  );
}

export function Chair({ position, facing }: { position: [number, number, number]; facing: number }) {
  const m = mats();
  return (
    <group position={position} rotation-y={facing}>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2;
        return (
          <group key={i} rotation-y={a}>
            <mesh position={[0.16, 0.05, 0]} castShadow material={m.blackSteel}><boxGeometry args={[0.32, 0.028, 0.045]} /></mesh>
            <mesh position={[0.31, 0.025, 0]} material={m.blackSteel}><sphereGeometry args={[0.025, 10, 8]} /></mesh>
          </group>
        );
      })}
      <mesh position={[0, 0.25, 0]} material={m.steel}><cylinderGeometry args={[0.022, 0.026, 0.36, 12]} /></mesh>
      <RoundedBox args={[0.52, 0.09, 0.5]} radius={0.035} smoothness={4} position={[0, 0.47, 0]} castShadow receiveShadow material={m.leatherChair} />
      <RoundedBox args={[0.5, 0.64, 0.085]} radius={0.04} smoothness={4} position={[0, 0.86, 0.24]} rotation-x={-0.16} castShadow receiveShadow material={m.leatherChair} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 0.27, 0.58, 0.02]} castShadow material={m.blackSteel}><boxGeometry args={[0.03, 0.2, 0.03]} /></mesh>
          <RoundedBox args={[0.06, 0.035, 0.32]} radius={0.012} position={[s * 0.27, 0.69, 0.0]} castShadow material={m.leatherChair} />
        </group>
      ))}
    </group>
  );
}

export function Chairs() {
  return (
    <group>
      <Chair position={[-2.02, 0, 0]} facing={-Math.PI / 2} />
      <Chair position={[2.02, 0, 0]} facing={Math.PI / 2} />
      {[-0.8, 0.8].map((x) => (
        <group key={x}>
          <Chair position={[x, 0, -1.02]} facing={Math.PI} />
          <Chair position={[x, 0, 1.0]} facing={0} />
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- left wall: credenza

const FOLDER_COLORS = ["#d7b878", "#c9a46a", "#d2b483", "#bf9a62", "#d9be86", "#c4a072"];

export function Credenza() {
  const m = mats();
  const x = -ROOM.x + 0.3;
  const deposit = useStore((s) => s.table.deposit);
  const status = useStore((s) => s.table.status);
  const sub = useStore((s) => s.table.sub);
  const plan = useMemo(() => sitePlan(), []);
  const planClick = useClickable("Site plan, Alameda Mixed-Use", { kind: "spot", id: "window" }, VIEWS.window);
  return (
    <group>
      <group position={[x, 0, 0.2]}>
        <RoundedBox args={[0.5, 0.78, 2.4]} radius={0.01} position={[0, 0.41, 0]} castShadow receiveShadow material={m.walnutDark} />
        <mesh position={[0, 0.81, 0]} castShadow receiveShadow material={m.walnut}><boxGeometry args={[0.54, 0.035, 2.46]} /></mesh>
        {[-0.6, 0, 0.6].map((z) => <mesh key={z} position={[0.252, 0.42, z]} material={m.blackSteel}><boxGeometry args={[0.004, 0.68, 0.004]} /></mesh>)}
        {[-0.9, -0.3, 0.3, 0.9].map((z) => <mesh key={z} position={[0.26, 0.6, z]} material={m.steel}><boxGeometry args={[0.02, 0.012, 0.12]} /></mesh>)}
        <Dossiers />
        <Printer deposit={deposit} sub={sub?.business ?? ""} />
        <Phone ringing={status === "escalated"} />
        <group position={[0.02, 0.83, 0.62]}>
          <mesh position={[0, 0.11, 0]} castShadow material={m.blackSteel}><cylinderGeometry args={[0.07, 0.075, 0.22, 24]} /></mesh>
          <mesh position={[0, 0.235, 0]} material={m.steel}><cylinderGeometry args={[0.03, 0.06, 0.04, 20]} /></mesh>
          {[0.15, 0.3].map((z) => (
            <group key={z} position={[0.04, 0, z]}>
              <mesh position={[0, 0.05, 0]} castShadow material={m.ceramic}><cylinderGeometry args={[0.042, 0.036, 0.1, 24, 1, true]} /></mesh>
              <mesh position={[0, 0.09, 0]} rotation-x={-Math.PI / 2} material={m.coffee}><circleGeometry args={[0.039, 24]} /></mesh>
            </group>
          ))}
        </group>
        <mesh position={[0.05, 0.89, 1.02]} scale={[1, 0.72, 1]} castShadow material={m.hardHat}><sphereGeometry args={[0.13, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
        <mesh position={[0.05, 0.835, 1.02]} rotation-x={-Math.PI / 2} material={m.hardHat}><ringGeometry args={[0.12, 0.17, 32]} /></mesh>
      </group>
      <group position={[-ROOM.x + 0.03, 1.7, 0.2]} rotation-y={Math.PI / 2} {...planClick.handlers}>
        <mesh material={m.blackSteel}><boxGeometry args={[1.3, 0.9, 0.03]} /></mesh>
        <mesh position={[0, 0, 0.017]} geometry={useMemo(() => uprightFace(1.2, 0.82), [])}>
          <meshStandardMaterial map={plan} roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

/** One dossier per sandbox owner, labeled with the business they run in a custom scenario. */
const DOSSIERS = OWNERS.map((o) => scenarioCase(rulebookFor("E", "demo", { owner: o.persona, profile: "clean" })).sub);

function Dossiers() {
  const persona = useStore((s) => s.persona);
  const tabs = useMemo(() => DOSSIERS.map((s, i) => folderTab(s, FOLDER_COLORS[i])), []);
  const m = mats();
  // A desktop step sorter: each folder sits a little further back and higher, so every tab shows.
  return (
    <group position={[0.1, 0.83, -0.62]}>
      <mesh position={[-0.08, 0.008, 0]} material={m.blackSteel}><boxGeometry args={[0.24, 0.016, 0.34]} /></mesh>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} position={[-i * 0.032 - 0.004, 0.02 + i * 0.03, 0]} material={m.blackSteel}><boxGeometry args={[0.006, 0.012, 0.34]} /></mesh>
      ))}
      {DOSSIERS.map((s, i) => (
        <Folder key={s.persona} i={i} tab={tabs[i]} color={FOLDER_COLORS[i]} active={s.persona === persona} persona={s.persona} label={`${s.persona} ${s.contact.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase())}`} />
      ))}
    </group>
  );
}

function Folder({ i, tab, color, active, persona, label }: { i: number; tab: THREE.Texture; color: string; active: boolean; persona: string; label: string }) {
  const ref = useRef<THREE.Group>(null!);
  const { handlers, hovered } = useClickable(`Set up a custom run: ${label}`, () => useStore.getState().backToStart({ owner: persona }));
  useFrame((_, dt) => {
    const y = active ? 0.07 : hovered ? 0.035 : 0;
    ref.current.position.y += (y - ref.current.position.y) * (1 - Math.exp(-dt * 8));
  });
  return (
    <group position={[-i * 0.032, i * 0.03, 0]} rotation-y={Math.PI / 2}>
      <group ref={ref} {...handlers}>
        <mesh position={[0, 0.15, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.3, 0.28, 0.008]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
        <mesh position={[-0.09 + (i % 3) * 0.09, 0.315, 0]}>
          <boxGeometry args={[0.2, 0.066, 0.013]} />
          <meshStandardMaterial attach="material-4" map={tab} roughness={0.8} />
          <meshStandardMaterial attach="material-5" map={tab} roughness={0.8} />
          <meshStandardMaterial attach="material-0" color={color} />
          <meshStandardMaterial attach="material-1" color={color} />
          <meshStandardMaterial attach="material-2" color={color} />
          <meshStandardMaterial attach="material-3" color={color} />
        </mesh>
      </group>
    </group>
  );
}

function Printer({ deposit, sub }: { deposit?: { transferId: string; amountCents: number; at: number }; sub: string }) {
  const m = mats();
  const paper = useRef<THREE.Group>(null!);
  const tex = useMemo(() => (deposit ? receipt(deposit.transferId, deposit.amountCents, sub, new Date().toISOString()) : null), [deposit, sub]);
  const { handlers } = useClickable("Deposit receipt", { kind: "spot", id: "receipt" }, VIEWS.credenza);
  useFrame(() => {
    if (!paper.current) return;
    const t = deposit ? Math.min(1, (performance.now() - deposit.at) / 1600) : 0;
    paper.current.scale.y = Math.max(0.001, t);
    paper.current.visible = !!deposit;
  });
  return (
    <group position={[0.02, 0.83, 0.12]} {...handlers}>
      <RoundedBox args={[0.2, 0.1, 0.16]} radius={0.015} position={[0, 0.05, 0]} castShadow material={m.anodized} />
      <mesh position={[0.06, 0.101, 0]} rotation-x={-Math.PI / 2} material={m.blackSteel}><planeGeometry args={[0.02, 0.12]} /></mesh>
      <mesh position={[-0.05, 0.102, 0.05]}><sphereGeometry args={[0.006, 10, 8]} /><meshStandardMaterial color="#111" emissive={deposit ? "#38d26b" : "#2b3a2f"} emissiveIntensity={deposit ? 3 : 0.4} /></mesh>
      <group ref={paper} position={[0.06, 0.1, 0]}>
        <mesh position={[0, 0.095, 0]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[0.085, 0.19]} />
          {tex ? <meshStandardMaterial key="printed" map={tex} roughness={0.9} side={THREE.DoubleSide} /> : <meshStandardMaterial key="blank" color="#f7f7f2" />}
        </mesh>
      </group>
    </group>
  );
}

function Phone({ ringing }: { ringing: boolean }) {
  const m = mats();
  const led = useRef<THREE.MeshStandardMaterial>(null!);
  const { handlers } = useClickable("Controller's phone", { kind: "spot", id: "phone" }, VIEWS.credenza);
  useFrame(() => { led.current.emissiveIntensity = ringing ? (Math.sin(performance.now() / 160) > 0 ? 4 : 0.2) : 0.1; });
  return (
    <group position={[0.03, 0.83, -0.12]} rotation-y={Math.PI / 2} {...handlers}>
      <RoundedBox args={[0.2, 0.05, 0.17]} radius={0.015} position={[0, 0.025, 0]} rotation-x={-0.18} castShadow material={m.anodized} />
      <RoundedBox args={[0.2, 0.035, 0.05]} radius={0.015} position={[0, 0.07, -0.04]} castShadow material={m.blackSteel} />
      <mesh position={[0.07, 0.056, 0.04]}><sphereGeometry args={[0.007, 10, 8]} /><meshStandardMaterial ref={led} color="#111" emissive="#ffae2b" emissiveIntensity={0.1} /></mesh>
    </group>
  );
}

// ---------------------------------------------------------------- right wall: whiteboard, policy, clock

export function AccentWall() {
  const m = mats();
  const table = useStore((s) => s.table);
  const board = useMemo(() => {
    const rows: BoardRow[] = [];
    for (const o of table.offers) {
      const label = `net ${o.offer.netDays} · ${o.offer.depositPct}% · $${Math.round(o.offer.limitCents / 100_000)}k`;
      let row = rows.find((r) => r.round === o.offer.round);
      if (!row) rows.push((row = { round: o.offer.round }));
      if (o.offer.from === "sub") row.sub = label;
      else if (o.rejected) row.rejected = label;
      else row.us = label;
    }
    const outcome = table.closed ? { text: `DEAL: net ${table.closed.terms.netDays} · ${table.closed.terms.depositPct}% · $${Math.round(table.closed.terms.limitCents / 100_000)}k`, color: INK.good }
      : table.ended ? { text: "TALKS ENDED · no order", color: INK.bad }
      : table.escalated ? { text: "PAUSED → controller", color: INK.warn } : null;
    return whiteboard(table.sub ? table.sub.business : "Bursar", rows.slice(0, 4), outcome);
  }, [table.offers, table.closed, table.ended, table.escalated, table.sub]);
  useEffect(() => () => board.dispose(), [board]);
  const rb = table.rulebook;
  const plaqueTex = useMemo(() => {
    if (!rb) return plaque("VENDOR TERMS POLICY", [["Set on the start page", "Rulebook"]]);
    const hs = rb.buyerRules.hardStops;
    return plaque("VENDOR TERMS POLICY", [
      ...(["low", "caution", "blocked"] as const).map((t) => [TIER_NAME[t], tierLine(rb, t).split(": ")[1].replace("best ", "").replace("max upfront ", "").replace("max limit ", "")] as [string, string]),
      ["Credit-limit anchor", rb.buyerRules.creditLimitAnchor.on ? `${rb.buyerRules.creditLimitAnchor.pct}% of recommended` : "off"],
      ["Fraud Finder", hs.fraudFinder.on ? `≥ ${hs.fraudFinder.threshold}: talks end` : "no stop"],
      ["Upfront over " + fmtUsd(rb.buyerRules.approval.secondApproverAboveCents), "second approver"],
      ["Every claim", "cross-examined against CRS"],
    ]);
  }, [rb]);
  useEffect(() => () => plaqueTex.dispose(), [plaqueTex]);
  const clockTex = useMemo(() => clockFace(), []);
  const hour = useRef<THREE.Group>(null!), min = useRef<THREE.Group>(null!), sec = useRef<THREE.Group>(null!);
  useFrame(() => {
    const d = new Date();
    const s = d.getSeconds() + d.getMilliseconds() / 1000, mm = d.getMinutes() + s / 60, hh = (d.getHours() % 12) + mm / 60;
    sec.current.rotation.z = -(s / 60) * Math.PI * 2;
    min.current.rotation.z = -(mm / 60) * Math.PI * 2;
    hour.current.rotation.z = -(hh / 12) * Math.PI * 2;
  });
  const wb = useClickable("Whiteboard: the rounds so far", { kind: "spot", id: "whiteboard" }, VIEWS.wall);
  const pl = useClickable("Vendor terms policy plaque", { kind: "spot", id: "policy" }, { pos: [3.2, 1.55, -0.9], target: [4.95, 1.5, -2.0] });
  const xw = ROOM.x - 0.02;
  return (
    <group>
      <group position={[xw, 1.48, 0.15]} rotation-y={-Math.PI / 2} {...wb.handlers}>
        <mesh material={m.steel}><boxGeometry args={[2.04, 1.29, 0.03]} /></mesh>
        <mesh position={[0, 0, 0.016]}>
          <planeGeometry args={[2.0, 1.25]} />
          <meshPhysicalMaterial map={board} roughness={0.12} clearcoat={1} clearcoatRoughness={0.08} />
        </mesh>
        <mesh position={[0, -0.66, 0.04]} material={m.steel}><boxGeometry args={[1.4, 0.02, 0.07]} /></mesh>
        {[["#1d4b9c", -0.35], ["#c3262d", -0.25], ["#202326", -0.15]].map(([c, x]) => (
          <mesh key={c as string} position={[x as number, -0.645, 0.05]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.009, 0.009, 0.13, 10]} /><meshStandardMaterial color={c as string} roughness={0.4} /></mesh>
        ))}
      </group>
      <group position={[xw, 1.5, -2.0]} rotation-y={-Math.PI / 2} {...pl.handlers}>
        <mesh position={[0, 0, 0.012]}>
          <boxGeometry args={[0.72, 0.56, 0.012]} />
          <meshStandardMaterial attach="material-4" map={plaqueTex} metalness={0.85} roughness={0.32} />
          <meshStandardMaterial attach="material-0" color="#9da1a3" metalness={0.9} roughness={0.3} />
          <meshStandardMaterial attach="material-1" color="#9da1a3" metalness={0.9} roughness={0.3} />
          <meshStandardMaterial attach="material-2" color="#9da1a3" metalness={0.9} roughness={0.3} />
          <meshStandardMaterial attach="material-3" color="#9da1a3" metalness={0.9} roughness={0.3} />
          <meshStandardMaterial attach="material-5" color="#9da1a3" metalness={0.9} roughness={0.3} />
        </mesh>
        {[[-0.32, 0.24], [0.32, 0.24], [-0.32, -0.24], [0.32, -0.24]].map(([x, y]) => (
          <mesh key={`${x}${y}`} position={[x, y, 0.022]} rotation-x={Math.PI / 2} material={m.steel}><cylinderGeometry args={[0.012, 0.012, 0.012, 16]} /></mesh>
        ))}
      </group>
      <group position={[xw, 2.3, 2.1]} rotation-y={-Math.PI / 2}>
        <mesh rotation-x={Math.PI / 2} material={m.blackSteel}><cylinderGeometry args={[0.2, 0.2, 0.04, 48]} /></mesh>
        <mesh position={[0, 0, 0.021]}><circleGeometry args={[0.185, 48]} /><meshStandardMaterial map={clockTex} roughness={0.4} /></mesh>
        <group ref={hour} position={[0, 0, 0.026]}><mesh position={[0, 0.04, 0]}><boxGeometry args={[0.012, 0.1, 0.004]} /><meshStandardMaterial color="#111" /></mesh></group>
        <group ref={min} position={[0, 0, 0.029]}><mesh position={[0, 0.065, 0]}><boxGeometry args={[0.008, 0.15, 0.004]} /><meshStandardMaterial color="#111" /></mesh></group>
        <group ref={sec} position={[0, 0, 0.032]}><mesh position={[0, 0.06, 0]}><boxGeometry args={[0.003, 0.16, 0.003]} /><meshStandardMaterial color="#c3262d" /></mesh></group>
      </group>
    </group>
  );
}
