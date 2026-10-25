// The table and everything fixed on it: walnut slab, leather blotters, the brass deal bar, the two agent units
// with nameplates, the trust gauge overhead, the sub's face-down report, the consent clipboard, the CRS call log
// binder, and the contract that lands when a deal closes.

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { CONTRACTOR, FACT_LABEL, consentFrom } from "@terms-room/api/negotiation";
import { useStore } from "../state/store";
import { mats } from "./materials";
import { AGENT_X, CONTRACT_POS, DEALBAR, GAUGE_POS, REPORT_POS, TABLE, dealbarX } from "./layout";
import { binderCover, consentForm, contract, dealbarScale, gaugeFace, INK, nameplate, reportFolder } from "./textures";
import { HIDDEN_CAPS, flatFace, sheetEdge, uprightFace, easeOutCubic, easeOutBack, clamp01 } from "./geo";
import { useClickable } from "./interact";
import { PAPER } from "./Pieces";

const look = (x: number, z: number, h = 0.55, back = 0.35) => ({ pos: [x, TABLE.top + h, z + back] as [number, number, number], target: [x, TABLE.top, z] as [number, number, number] });

export function Table() {
  const m = mats();
  return (
    <group>
      <RoundedBox args={[TABLE.w, TABLE.thick, TABLE.d]} radius={0.022} smoothness={5} position={[0, TABLE.top - TABLE.thick / 2, 0]} castShadow receiveShadow material={m.walnut} />
      {[-1.12, 1.12].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, (TABLE.top - TABLE.thick) / 2, 0]} castShadow receiveShadow material={m.blackSteel}><boxGeometry args={[0.07, TABLE.top - TABLE.thick, 0.82]} /></mesh>
          <mesh position={[0, 0.02, 0]} castShadow receiveShadow material={m.blackSteel}><boxGeometry args={[0.1, 0.04, 1.02]} /></mesh>
          <mesh position={[0, TABLE.top - TABLE.thick - 0.02, 0]} castShadow material={m.blackSteel}><boxGeometry args={[0.12, 0.04, 1.1]} /></mesh>
        </group>
      ))}
      <mesh position={[0, 0.36, 0]} castShadow material={m.blackSteel}><boxGeometry args={[2.24, 0.05, 0.06]} /></mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1.24, TABLE.top + 0.0012, 0]} receiveShadow material={m.leatherTop}>
          <boxGeometry args={[0.6, 0.0024, 0.92]} />
        </mesh>
      ))}
      <Glass position={[-1.05, 0, 0.42]} />
      <Glass position={[1.05, 0, 0.42]} />
      <Pen position={[-1.0, 0, -0.38]} rot={0.5} />
      <Pen position={[1.24, 0, 0.47]} rot={-0.3} />
    </group>
  );
}

function Glass({ position }: { position: [number, number, number] }) {
  const m = mats();
  return (
    <group position={[position[0], TABLE.top, position[2]]}>
      <mesh position={[0, 0.055, 0]} material={m.waterGlass}><cylinderGeometry args={[0.036, 0.031, 0.11, 32, 1, true]} /></mesh>
      <mesh position={[0, 0.004, 0]} material={m.waterGlass}><cylinderGeometry args={[0.031, 0.031, 0.008, 32]} /></mesh>
      <mesh position={[0, 0.04, 0]} material={m.water}><cylinderGeometry args={[0.033, 0.03, 0.07, 32]} /></mesh>
    </group>
  );
}

function Pen({ position, rot }: { position: [number, number, number]; rot: number }) {
  const m = mats();
  return (
    <group position={[position[0], TABLE.top + 0.006, position[2]]} rotation-y={rot}>
      <mesh rotation-z={Math.PI / 2} castShadow material={m.blackSteel}><cylinderGeometry args={[0.0055, 0.005, 0.14, 12]} /></mesh>
      <mesh position={[0.075, 0, 0]} rotation-z={Math.PI / 2} material={m.brass}><coneGeometry args={[0.005, 0.014, 12]} /></mesh>
      <mesh position={[-0.04, 0.006, 0]} material={m.brass}><boxGeometry args={[0.05, 0.002, 0.003]} /></mesh>
    </group>
  );
}

// ---------------------------------------------------------------- deal bar

export function DealBar() {
  const m = mats();
  const table = useStore((s) => s.table);
  const cap = table.tier && table.tier.tier !== "low" ? table.tier.limits.maxUpfrontPct : null;
  const scale = useMemo(() => dealbarScale(cap), [cap]);
  const plate = useMemo(() => flatFace(2.0, 0.172, 0.01), []);
  const marker = useRef<THREE.Group>(null!);
  const ghostC = useRef<THREE.Group>(null!), ghostS = useRef<THREE.Group>(null!);
  const enamel = useRef<THREE.MeshStandardMaterial>(null!);
  const target = table.current?.depositPct ?? table.ask?.upfrontPct ?? 0;
  const sideColor = useMemo(() => new THREE.Color(), []);
  const { handlers } = useClickable("Deal bar: up front, 0 to 50%", { kind: "spot", id: "dealbar" }, look(0, DEALBAR.z, 0.45, 0.42));
  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 3.2);
    const z = DEALBAR.z - 0.045;
    marker.current.position.x += (dealbarX(target) - marker.current.position.x) * k;
    marker.current.position.z = z;
    const c = table.lastMade.contractor, s = table.lastMade.sub;
    ghostC.current.visible = !!c; ghostS.current.visible = !!s;
    if (c) ghostC.current.position.x += (dealbarX(c.depositPct) - ghostC.current.position.x) * k;
    if (s) ghostS.current.position.x += (dealbarX(s.depositPct) - ghostS.current.position.x) * k;
    sideColor.set(table.status === "ended" ? INK.bad : table.closed ? INK.good : table.current?.from === "contractor" ? INK.contractor : INK.sub);
    enamel.current.color.lerp(sideColor, k);
  });
  return (
    <group {...handlers}>
      <mesh position={[0, TABLE.top + 0.004, DEALBAR.z]} castShadow receiveShadow material={m.blackSteel}><boxGeometry args={[2.06, 0.008, 0.19]} /></mesh>
      <mesh geometry={plate} position={[0, TABLE.top + 0.0085, DEALBAR.z]}>
        <meshStandardMaterial map={scale} metalness={0.9} roughness={0.34} color="#f1dcb2" />
      </mesh>
      <mesh position={[0, TABLE.top + 0.011, DEALBAR.z - 0.045]} material={m.blackSteel}><boxGeometry args={[1.97, 0.003, 0.012]} /></mesh>
      <group ref={marker} position={[dealbarX(30), TABLE.top + 0.0085, DEALBAR.z - 0.045]}>
        <mesh position={[0, 0.011, 0]} castShadow material={m.brass}><cylinderGeometry args={[0.032, 0.035, 0.022, 40]} /></mesh>
        <mesh position={[0, 0.0225, 0]}><cylinderGeometry args={[0.025, 0.025, 0.002, 40]} /><meshStandardMaterial ref={enamel} color={INK.sub} roughness={0.25} metalness={0.1} /></mesh>
        <mesh position={[0, 0.003, 0.05]} material={m.brass}><boxGeometry args={[0.004, 0.006, 0.04]} /></mesh>
      </group>
      <group ref={ghostC} position={[dealbarX(0), TABLE.top + 0.0085, DEALBAR.z + 0.07]}>
        <mesh position={[0, 0.012, 0]} castShadow><cylinderGeometry args={[0.011, 0.013, 0.024, 20]} /><meshStandardMaterial color={INK.contractor} roughness={0.35} /></mesh>
      </group>
      <group ref={ghostS} position={[dealbarX(30), TABLE.top + 0.0085, DEALBAR.z + 0.07]}>
        <mesh position={[0, 0.012, 0]} castShadow><cylinderGeometry args={[0.011, 0.013, 0.024, 20]} /><meshStandardMaterial color={INK.sub} roughness={0.35} /></mesh>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------- agents

export function AgentUnit({ side }: { side: "contractor" | "sub" }) {
  const m = mats();
  const x = side === "contractor" ? -AGENT_X : AGENT_X;
  const ring = useRef<THREE.MeshStandardMaterial>(null!);
  const glow = useRef<THREE.PointLight>(null!);
  const color = side === "contractor" ? "#8cc2ff" : "#ffad66";
  const sub = useStore((s) => s.table.sub);
  const plateTex = useMemo(() => nameplate(side === "contractor" ? "CONTRACTOR AGENT" : "VENDOR AGENT",
    side === "contractor" ? CONTRACTOR.name : sub?.business ?? "the vendor", side), [side, sub?.business]);
  const face = useMemo(() => uprightFace(0.34, 0.08), []);
  const { handlers } = useClickable(side === "contractor" ? "Contractor agent's seat" : "Vendor agent's seat",
    { kind: "spot", id: side === "contractor" ? "agent-contractor" : "agent-sub" }, look(x * 0.8, 0.1, 0.4, 0.5));
  useFrame(() => {
    const st = useStore.getState().table;
    const active = st.actor === side && performance.now() - st.lastEventAt < 1600 && st.status === "negotiating";
    const pulse = active ? 2.4 + Math.sin(performance.now() / 120) * 1.4 : 0.35;
    ring.current.emissiveIntensity += (pulse - ring.current.emissiveIntensity) * 0.2;
    glow.current.intensity = ring.current.emissiveIntensity * 0.05;
  });
  return (
    <group {...handlers}>
      <group position={[x, TABLE.top, 0]}>
        <mesh position={[0, 0.016, 0]} castShadow material={m.anodized}><cylinderGeometry args={[0.07, 0.074, 0.032, 48]} /></mesh>
        <mesh position={[0, 0.067, 0]} castShadow material={m.grille}><cylinderGeometry args={[0.064, 0.068, 0.07, 48]} /></mesh>
        <mesh position={[0, 0.108, 0]} castShadow material={m.anodized}><cylinderGeometry args={[0.064, 0.064, 0.012, 48]} /></mesh>
        <mesh position={[0, 0.115, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.048, 0.0035, 10, 64]} />
          <meshStandardMaterial ref={ring} color="#111" emissive={color} emissiveIntensity={0.35} />
        </mesh>
        <pointLight ref={glow} position={[0, 0.16, 0]} color={color} intensity={0.02} distance={0.8} decay={2} />
      </group>
      <group position={[x * 0.79, TABLE.top, 0.56]} rotation-x={-0.32}>
        <mesh position={[0, 0.04, 0]} castShadow material={m.brass}><boxGeometry args={[0.35, 0.085, 0.006]} /></mesh>
        <mesh geometry={face} position={[0, 0.04, 0.0032]}>
          <meshStandardMaterial map={plateTex} metalness={0.85} roughness={0.33} />
        </mesh>
      </group>
      <mesh position={[x * 0.79, TABLE.top + 0.012, 0.6]} castShadow material={m.brass}><boxGeometry args={[0.36, 0.006, 0.07]} /></mesh>
    </group>
  );
}

// ---------------------------------------------------------------- trust gauge

export function Gauge() {
  const m = mats();
  const faceTex = useMemo(() => gaugeFace(), []);
  const needle = useRef<THREE.Group>(null!);
  const trust = useStore((s) => s.table.trust);
  const { handlers } = useClickable("Trust meter", { kind: "spot", id: "gauge" }, { pos: [0, 1.72, 0.85], target: [GAUGE_POS[0], GAUGE_POS[1], GAUGE_POS[2]] });
  useFrame((_, dt) => {
    const want = -THREE.MathUtils.degToRad(-135 + trust * 2.7);
    needle.current.rotation.z += (want - needle.current.rotation.z) * (1 - Math.exp(-dt * 2.2));
  });
  return (
    <group position={GAUGE_POS} rotation-x={-0.12} {...handlers}>
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, (3 - GAUGE_POS[1]) / 2 + 0.12, -0.03]} material={m.blackSteel}><cylinderGeometry args={[0.0025, 0.0025, 3 - GAUGE_POS[1], 6]} /></mesh>
      ))}
      <mesh rotation-x={Math.PI / 2} position={[0, 0, -0.03]} castShadow material={m.anodized}><cylinderGeometry args={[0.235, 0.235, 0.06, 64]} /></mesh>
      <mesh position={[0, 0, 0.002]} material={m.brass}><torusGeometry args={[0.226, 0.014, 16, 80]} /></mesh>
      <mesh position={[0, 0, 0.001]}><circleGeometry args={[0.215, 64]} /><meshStandardMaterial map={faceTex} roughness={0.55} /></mesh>
      <group ref={needle} position={[0, 0, 0.008]} rotation-z={THREE.MathUtils.degToRad(135)}>
        <mesh position={[0, 0.08, 0]}><boxGeometry args={[0.007, 0.19, 0.003]} /><meshStandardMaterial color="#b3261e" roughness={0.4} /></mesh>
        <mesh position={[0, -0.025, 0]}><boxGeometry args={[0.012, 0.05, 0.003]} /><meshStandardMaterial color="#1d2124" /></mesh>
      </group>
      <mesh position={[0, 0, 0.012]} rotation-x={Math.PI / 2} material={m.brass}><cylinderGeometry args={[0.014, 0.014, 0.008, 24]} /></mesh>
      <mesh position={[0, 0, 0.02]}>
        <circleGeometry args={[0.218, 64]} />
        <meshPhysicalMaterial color="#ffffff" roughness={0.02} transparent opacity={0.08} clearcoat={1} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- paper fixtures

export function ReportFolder() {
  const m = mats();
  const report = useStore((s) => s.table.report);
  const ref = useRef<THREE.Group>(null!);
  const held = !!report?.callId;
  const tex = useMemo(() => reportFolder(held), [held]);
  const face = useMemo(() => flatFace(0.27, 0.19, 0.008), []);
  const edge = useMemo(() => sheetEdge(0.27, 0.19, 0.008, 0.006), []);
  const { handlers, hovered } = useClickable(held ? "The vendor's own report (face down)" : "No report: no consent", { kind: "spot", id: "report" }, look(REPORT_POS[0], REPORT_POS[2], 0.45, 0.3));
  useFrame(() => {
    if (!report) { ref.current.visible = false; return; }
    ref.current.visible = true;
    const t = easeOutCubic((performance.now() - report.at) / 900);
    ref.current.position.set(THREE.MathUtils.lerp(AGENT_X, REPORT_POS[0], t), REPORT_POS[1] + Math.sin(t * Math.PI) * 0.04 + (hovered ? 0.01 : 0), THREE.MathUtils.lerp(0, REPORT_POS[2], t));
    ref.current.rotation.y = THREE.MathUtils.lerp(-0.9, -0.12, t);
  });
  return (
    <group ref={ref} {...handlers}>
      <mesh geometry={edge} castShadow material={[HIDDEN_CAPS, m.paperEdge]} />
      <mesh geometry={face} position-y={0.0031}><meshStandardMaterial map={tex} color={PAPER} roughness={0.85} /></mesh>
    </group>
  );
}

export function ConsentClipboard() {
  const m = mats();
  const sub = useStore((s) => s.table.sub);
  const rb = useStore((s) => s.table.rulebook);
  const tex = useMemo(() => {
    const c = rb && sub ? consentFrom(rb, sub, new Date()) : null;
    return consentForm(c, sub, c ? `Only: ${c.scope.map((f) => FACT_LABEL[f]).join(", ")}. The full report stays with me.` : "");
  }, [rb, sub]);
  useEffect(() => () => tex.dispose(), [tex]);
  const face = useMemo(() => flatFace(0.2, 0.26, 0.004), []);
  const { handlers, hovered } = useClickable("Consent record", { kind: "spot", id: "consent" }, look(1.3, 0.28, 0.42, 0.28));
  return (
    <group position={[1.36, TABLE.top + 0.003 + (hovered ? 0.008 : 0), 0.24]} rotation-y={0.18} {...handlers}>
      <RoundedBox args={[0.23, 0.006, 0.31]} radius={0.002} castShadow receiveShadow material={m.walnutDark} />
      <mesh geometry={face} position={[0, 0.0035, 0.015]}><meshStandardMaterial map={tex} color={PAPER} roughness={0.85} /></mesh>
      <RoundedBox args={[0.1, 0.012, 0.03]} radius={0.004} position={[0, 0.008, -0.135]} castShadow material={m.steel} />
    </group>
  );
}

export function LogBinder() {
  const m = mats();
  const tex = useMemo(() => binderCover(), []);
  const face = useMemo(() => flatFace(0.23, 0.3, 0.008), []);
  const count = useStore((s) => s.table.log.length);
  const { handlers, hovered } = useClickable(`CRS call log (${count} call${count === 1 ? "" : "s"})`, { kind: "spot", id: "log" }, look(-1.3, 0.26, 0.42, 0.28));
  return (
    <group position={[-1.34, TABLE.top + 0.012 + (hovered ? 0.008 : 0), 0.24]} rotation-y={-0.15} {...handlers}>
      <RoundedBox args={[0.24, 0.024, 0.31]} radius={0.004} castShadow receiveShadow material={m.anodized} />
      <mesh geometry={face} position-y={0.0125}><meshStandardMaterial map={tex} roughness={0.75} /></mesh>
      <mesh position={[-0.112, 0, 0]} rotation-x={Math.PI / 2} material={m.steel}><cylinderGeometry args={[0.013, 0.013, 0.3, 16]} /></mesh>
      {Array.from({ length: Math.min(12, count) }, (_, i) => (
        <mesh key={i} position={[0.004, -0.009 + i * 0.0014, 0]}><boxGeometry args={[0.215, 0.0011, 0.285]} /><meshStandardMaterial color="#f5f3ec" roughness={0.9} /></mesh>
      ))}
    </group>
  );
}

export function Contract() {
  const m = mats();
  const t = useStore((s) => s.table);
  const ref = useRef<THREE.Group>(null!);
  const glow = useRef<THREE.MeshBasicMaterial>(null!);
  const [signed, setSigned] = useState(0);
  const closed = t.closed;
  useEffect(() => setSigned(0), [closed]);
  const tex = useMemo(() => {
    if (!closed || !t.sub) return null;
    return contract({ sub: t.sub, contractor: CONTRACTOR.name, project: CONTRACTOR.project, terms: closed.terms, depositCents: closed.depositCents,
      rounds: closed.rounds, negotiationId: t.negotiationId ?? "", signed, approvedBy: t.approved?.approvers, transferId: t.deposit?.transferId,
      citations: t.offers.filter((o) => !o.rejected).reduce((n, o) => n + o.offer.citations.length, 0) });
  }, [closed, t.sub, signed, t.approved, t.deposit, t.negotiationId, t.offers]);
  useEffect(() => () => tex?.dispose(), [tex]);
  const face = useMemo(() => flatFace(0.3, 0.424, 0.006), []);
  const edge = useMemo(() => sheetEdge(0.3, 0.424, 0.006, 0.0015), []);
  const { handlers } = useClickable("The signed agreement", { kind: "spot", id: "contract" }, look(CONTRACT_POS[0], CONTRACT_POS[2], 0.62, 0.3));
  useFrame(() => {
    if (!closed) { ref.current.visible = false; return; }
    ref.current.visible = true;
    const age = performance.now() - closed.at;
    const d = easeOutBack(age / 1300);
    ref.current.position.set(CONTRACT_POS[0], CONTRACT_POS[1] + 0.012 + (1 - d) * 0.55, CONTRACT_POS[2]);
    ref.current.rotation.set((1 - clamp01(age / 1300)) * -0.6, (1 - clamp01(age / 1300)) * 0.4 - 0.03, 0);
    const step = Math.round(clamp01((age - 1200) / 1800) * 12) / 12;
    if (step !== signed) setSigned(step);
    glow.current.opacity = 0.18 + Math.sin(age / 380) * 0.08 + (t.approved ? 0.08 : 0);
  });
  return (
    <group ref={ref} {...handlers}>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.0012} scale={[1.18, 1.12, 1]}>
        <planeGeometry args={[0.3, 0.424]} />
        <meshBasicMaterial ref={glow} color="#ffd27a" transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={edge} castShadow material={[HIDDEN_CAPS, m.paperEdge]} />
      <mesh geometry={face} position-y={0.0008}>{tex ? <meshStandardMaterial key="printed" map={tex} color={PAPER} roughness={0.85} /> : <meshStandardMaterial key="blank" color="#e2dfd8" />}</mesh>
    </group>
  );
}
