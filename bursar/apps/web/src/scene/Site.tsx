// What you see through the window: Building B going up, a tower crane slewing, the fence banner, trucks.
// The office is on the second floor, so the site ground sits below the room floor.

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { mats } from "./materials";
import { banner } from "./textures";
import { SUN } from "./Lighting";

const G = -4.6; // site ground level

function Instanced({ items, material, geometry, cast = true }: { items: THREE.Matrix4[]; material: THREE.Material; geometry: THREE.BufferGeometry; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    items.forEach((m, i) => ref.current.setMatrixAt(i, m));
    ref.current.instanceMatrix.needsUpdate = true;
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={cast} receiveShadow />;
}

const mat4 = (p: [number, number, number], s: [number, number, number], r: [number, number, number] = [0, 0, 0]) =>
  new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));

const unitBox = new THREE.BoxGeometry(1, 1, 1);

function BuildingB() {
  const m = mats();
  const { slabs, columns, rebar, scaffold, glazing } = useMemo(() => {
    const slabs: THREE.Matrix4[] = [], columns: THREE.Matrix4[] = [], rebar: THREE.Matrix4[] = [], scaffold: THREE.Matrix4[] = [], glazing: THREE.Matrix4[] = [];
    const cx = -4, cz = -44, w = 24, d = 15, fh = 3.7, floors = 6;
    for (let f = 0; f <= floors; f++) {
      const y = G + f * fh;
      if (f < floors) slabs.push(mat4([cx, y + 0.15, cz], [w, 0.3, d]));
      if (f === floors) break;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++)
        columns.push(mat4([cx - w / 2 + 1 + i * ((w - 2) / 5), y + fh / 2 + 0.15, cz - d / 2 + 1 + j * ((d - 2) / 3)], [0.55, fh - 0.3, 0.55]));
      if (f < 2) glazing.push(mat4([cx, y + fh / 2 + 0.15, cz + d / 2 + 0.05], [w - 0.4, fh - 0.4, 0.06]));
    }
    const top = G + floors * fh;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) rebar.push(mat4([cx - w / 2 + 1 + i * ((w - 2) / 5) + (k % 2) * 0.3 - 0.15, top + 1.2, cz - d / 2 + 1 + j * ((d - 2) / 3) + (k > 1 ? 0.15 : -0.15)], [0.035, 2.4, 0.035]));
    const sz = cz + d / 2 + 1.0;
    for (let lvl = 0; lvl <= 5; lvl++) {
      const y = G + 2 * fh + lvl * 2;
      scaffold.push(mat4([cx, y, sz], [w, 0.06, 0.06]));
      scaffold.push(mat4([cx, y, sz + 1.1], [w, 0.06, 0.06]));
      scaffold.push(mat4([cx, y - 0.05, sz + 0.55], [w, 0.04, 1.0]));
    }
    for (let i = 0; i <= 12; i++) {
      const x = cx - w / 2 + i * (w / 12);
      for (const zz of [sz, sz + 1.1]) scaffold.push(mat4([x, G + 2 * fh + 5, zz], [0.06, 10, 0.06]));
    }
    return { slabs, columns, rebar, scaffold, glazing };
  }, []);
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#7d97a6", roughness: 0.08, metalness: 0.4, envMapIntensity: 1.3 }), []);
  return (
    <group>
      <Instanced items={slabs} material={m.concreteRaw} geometry={unitBox} />
      <Instanced items={columns} material={m.concreteRaw} geometry={unitBox} />
      <Instanced items={rebar} material={m.rebar} geometry={unitBox} cast={false} />
      <Instanced items={scaffold} material={m.steel} geometry={unitBox} cast={false} />
      <Instanced items={glazing} material={glass} geometry={unitBox} cast={false} />
    </group>
  );
}

function Crane() {
  const m = mats();
  const slew = useRef<THREE.Group>(null!);
  const trolley = useRef<THREE.Group>(null!);
  const H = 44;
  const mast = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) out.push(mat4([x, H / 2, z], [0.12, H, 0.12]));
    for (let y = 0; y < H; y += 2.2) {
      for (const side of [0, 1, 2, 3]) {
        const r = (side * Math.PI) / 2;
        const off = new THREE.Vector3(0, 0, 0.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), r);
        out.push(mat4([off.x, y + 1.1, off.z], [0.06, 2.4, 0.06], [side % 2 ? 0.63 : 0, r, side % 2 ? 0 : 0.63]));
      }
    }
    return out;
  }, []);
  const jib = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    const L = 46, C = 14;
    for (const [y, z] of [[0, -0.6], [0, 0.6], [1.6, 0]]) out.push(mat4([-(L - C) / 2, H + 1 + y, z], [L + C, 0.12, 0.12]));
    for (let x = -L; x < C; x += 1.8) {
      out.push(mat4([x, H + 1.8, -0.3], [0.05, 1.8, 0.05], [0.36, 0, 0.5]));
      out.push(mat4([x, H + 1.8, 0.3], [0.05, 1.8, 0.05], [-0.36, 0, 0.5]));
    }
    return out;
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    slew.current.rotation.y = 0.55 + Math.sin(t * 0.05) * 0.5;
    trolley.current.position.x = -20 + Math.sin(t * 0.08) * 12;
  });
  return (
    <group position={[16, G, -36]}>
      <mesh position={[0, 0.6, 0]} castShadow material={m.concreteRaw}><boxGeometry args={[4, 1.2, 4]} /></mesh>
      <Instanced items={mast} material={m.craneYellow} geometry={unitBox} />
      <group ref={slew}>
        <Instanced items={jib} material={m.craneYellow} geometry={unitBox} />
        <mesh position={[1.6, H + 0.4, 1.2]} castShadow material={m.whiteMatte}><boxGeometry args={[1.8, 2, 1.8]} /></mesh>
        <mesh position={[11, H + 0.2, 0]} castShadow material={m.concreteRaw}><boxGeometry args={[3.2, 2.6, 1.6]} /></mesh>
        <mesh position={[0, H + 5, 0]} material={m.craneYellow}><boxGeometry args={[0.6, 8, 0.6]} /></mesh>
        <group ref={trolley} position={[-20, H + 0.8, 0]}>
          <mesh material={m.blackSteel}><boxGeometry args={[1, 0.4, 1.2]} /></mesh>
          <mesh position={[0, -9, 0]} material={m.blackSteel}><cylinderGeometry args={[0.02, 0.02, 18, 4]} /></mesh>
          <mesh position={[0, -18.3, 0]} material={m.safetyOrange}><boxGeometry args={[0.5, 0.7, 0.4]} /></mesh>
          <group position={[0, -20.2, 0]}>
            {[-0.25, -0.08, 0.08, 0.25].map((z) => (
              <mesh key={z} position={[0, 0, z]} rotation-z={Math.PI / 2} material={m.rebar}><cylinderGeometry args={[0.05, 0.05, 6, 6]} /></mesh>
            ))}
          </group>
        </group>
      </group>
    </group>
  );
}

function Fence() {
  const m = mats();
  const tex = useMemo(() => banner(["KEYSTONE BAY BUILDERS", "ALAMEDA MIXED-USE · BUILDING B · ALL VISITORS CHECK IN AT THE TRAILER"]), []);
  const posts = useMemo(() => Array.from({ length: 26 }, (_, i) => mat4([-30 + i * 2.6, G + 1, -13], [0.06, 2, 0.06])), []);
  return (
    <group>
      <Instanced items={posts} material={m.steel} geometry={unitBox} />
      <mesh position={[2.5, G + 1.05, -12.97]}>
        <planeGeometry args={[18, 1.6]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      <mesh position={[-15, G + 1.05, -12.98]}><planeGeometry args={[30, 1.6]} /><meshStandardMaterial color="#204a33" roughness={0.95} transparent opacity={0.85} /></mesh>
      <mesh position={[20, G + 1.05, -12.98]}><planeGeometry args={[18, 1.6]} /><meshStandardMaterial color="#204a33" roughness={0.95} transparent opacity={0.85} /></mesh>
    </group>
  );
}

function Truck({ position, color, rot = 0 }: { position: [number, number, number]; color: string; rot?: number }) {
  const body = useMemo(() => new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, metalness: 0.2 }), [color]);
  const m = mats();
  return (
    <group position={position} rotation-y={rot}>
      <mesh position={[0.9, 1.05, 0]} castShadow material={body}><boxGeometry args={[1.9, 1.1, 1.9]} /></mesh>
      <mesh position={[-0.9, 0.75, 0]} castShadow material={body}><boxGeometry args={[2.2, 0.5, 1.9]} /></mesh>
      <mesh position={[1.35, 1.25, 0]} material={m.glass}><boxGeometry args={[0.6, 0.5, 1.92]} /></mesh>
      {[[-1.3, 0.95], [-1.3, -0.95], [1.1, 0.95], [1.1, -0.95]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.38, z]} rotation-x={Math.PI / 2} material={m.blackSteel}><cylinderGeometry args={[0.38, 0.38, 0.28, 18]} /></mesh>
      ))}
    </group>
  );
}

function Mixer() {
  const m = mats();
  const drum = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => { drum.current.rotation.x += dt * 0.9; });
  return (
    <group position={[-9, G, -18]} rotation-y={0.4}>
      <mesh position={[3, 1.4, 0]} castShadow material={m.whiteMatte}><boxGeometry args={[2, 2.1, 2.4]} /></mesh>
      <mesh position={[-1, 0.8, 0]} castShadow material={m.blackSteel}><boxGeometry args={[6, 0.4, 2.2]} /></mesh>
      <mesh ref={drum} position={[-1, 2.4, 0]} rotation-z={Math.PI / 2 - 0.25} castShadow material={m.safetyOrange}><cylinderGeometry args={[1.1, 0.7, 4.2, 20]} /></mesh>
      {[-3, -1.6, 2.6].map((x) => [1.1, -1.1].map((z) => (
        <mesh key={`${x}${z}`} position={[x, 0.5, z]} rotation-x={Math.PI / 2} material={m.blackSteel}><cylinderGeometry args={[0.5, 0.5, 0.35, 18]} /></mesh>
      )))}
    </group>
  );
}

function Trees() {
  const m = mats();
  const items = useMemo(() => {
    const out: THREE.Matrix4[] = [];
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI - Math.PI, d = 45 + r() * 70;
      const x = Math.sin(a) * d, z = -Math.abs(Math.cos(a)) * d - 20;
      const h = 5 + r() * 7;
      out.push(mat4([x, G + h / 2 + 1.5, z], [h * 0.45, h, h * 0.45]));
    }
    return out;
  }, []);
  const leaf = useMemo(() => new THREE.MeshStandardMaterial({ color: "#47603a", roughness: 0.95 }), []);
  const geo = useMemo(() => new THREE.IcosahedronGeometry(0.5, 1), []);
  return <Instanced items={items} material={leaf} geometry={geo} cast={false} />;
}

function Hills() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(900, 260, 120, 20);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, Math.max(0, (y + 130) / 260) * (18 + Math.sin(x * 0.012) * 14 + Math.sin(x * 0.041 + 2) * 6));
    }
    g.computeVertexNormals();
    return g;
  }, []);
  return (
    <mesh geometry={geo} rotation-x={-Math.PI / 2} position={[0, G - 1, -260]}>
      <meshStandardMaterial color="#7e8a6f" roughness={1} />
    </mesh>
  );
}

export function Site() {
  const m = mats();
  return (
    <group>
      <Sky sunPosition={SUN} turbidity={7} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.86} distance={1800} />
      {/* skylight on the site facades that face the office; the sun is behind them */}
      <directionalLight position={[10, 30, 40]} target-position={[0, G, -40]} intensity={1.8} color="#e6e2da" />
      <mesh rotation-x={-Math.PI / 2} position={[0, G, -120]} receiveShadow material={m.ground}><planeGeometry args={[500, 240]} /></mesh>
      {/* the office building's own facade below and beside our window */}
      <mesh position={[0, G / 2 - 0.1, -3.8]} material={m.concreteRaw}><boxGeometry args={[14, -G, 0.3]} /></mesh>
      <BuildingB />
      <Crane />
      <Fence />
      <Mixer />
      <Truck position={[-3, G, -10]} color="#e6e8ea" rot={0.2} />
      <Truck position={[7, G, -16]} color="#3a5f87" rot={-1.2} />
      <group position={[12, G, -14]}>
        <mesh position={[0, 1.3, 0]} castShadow material={m.whiteMatte}><boxGeometry args={[9, 2.6, 3]} /></mesh>
        <mesh position={[0, 0.2, 0]} material={m.blackSteel}><boxGeometry args={[8.6, 0.4, 2.6]} /></mesh>
      </group>
      {[-14, -12.8].map((x) => (
        <mesh key={x} position={[x, G + 1.15, -11.5]} castShadow><boxGeometry args={[1.1, 2.3, 1.1]} /><meshStandardMaterial color="#2e63a8" roughness={0.6} /></mesh>
      ))}
      <Trees />
      <Hills />
    </group>
  );
}
