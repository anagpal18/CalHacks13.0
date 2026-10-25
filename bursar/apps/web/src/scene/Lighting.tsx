// Late-afternoon sun through the window wall, warm pendants over the table, and a studio environment
// built from light panels (no HDR download) so the brass and the clear coat on the walnut have something to reflect.

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, N8AO, Bloom, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { useStore } from "../state/store";
import { TABLE } from "./layout";

/** Low golden sun from behind-left, about 17 degrees up, so it reaches the table through the glass. */
export const SUN: [number, number, number] = [-8, 5, -14];

export function Lighting() {
  const status = useStore((s) => s.table.status);
  const quality = useStore((s) => s.quality);
  const spots = useRef<THREE.SpotLight[]>([]);
  const targets = useMemo(() => [new THREE.Object3D(), new THREE.Object3D()], []);
  const warm = useMemo(() => new THREE.Color("#ffd9a8"), []);
  const red = useMemo(() => new THREE.Color("#ff3a26"), []);
  const amber = useMemo(() => new THREE.Color("#ffa030"), []);
  const sun = useRef<THREE.DirectionalLight>(null!);

  useFrame((_, dt) => {
    const want = status === "ended" ? red : status === "escalated" ? amber : warm;
    const k = 1 - Math.exp(-dt * 2.5);
    spots.current.forEach((s) => {
      s.color.lerp(want, k);
      s.intensity += ((status === "ended" ? 16 : 7.5) - s.intensity) * k;
    });
    sun.current.intensity += ((status === "ended" ? 1.0 : 2.4) - sun.current.intensity) * k;
  });

  return (
    <>
      <hemisphereLight args={["#dfe7ef", "#5d4c3e", 0.35]} />
      <directionalLight
        ref={sun} position={SUN} intensity={2.4} color="#ffcc94" castShadow
        shadow-mapSize={[quality === "high" ? 2048 : 1024, quality === "high" ? 2048 : 1024]}
        shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={6} shadow-camera-bottom={-6}
        shadow-camera-near={2} shadow-camera-far={40} shadow-bias={-0.00025} shadow-normalBias={0.025}
      />
      {targets.map((t, i) => <primitive key={i} object={t} position={[i ? 0.7 : -0.7, TABLE.top, -0.05]} />)}
      {[-0.7, 0.7].map((x, i) => (
        <spotLight
          key={x} ref={(s) => { if (s) spots.current[i] = s; }} position={[x, 2.58, -0.05]} target={targets[i]}
          angle={0.85} penumbra={0.9} intensity={7.5} distance={6} decay={2} color="#ffd9a8"
          castShadow={i === 0} shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} shadow-radius={6}
        />
      ))}
      <Environment resolution={256} frames={1} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={2.2} color="#fff1dc" position={[0, 1.7, -3.4]} scale={[9, 1.9, 1]} target={[0, 1.2, 0]} />
        <Lightformer form="rect" intensity={0.9} color="#ffe6c8" position={[0, 2.95, 0]} rotation-x={Math.PI / 2} scale={[3, 1.2, 1]} />
        <Lightformer form="rect" intensity={0.35} color="#dbe4ee" position={[-4.9, 1.6, 0]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} />
        <Lightformer form="rect" intensity={0.25} color="#cfd9e4" position={[4.9, 1.6, 0]} rotation-y={-Math.PI / 2} scale={[6, 2, 1]} />
        <Lightformer form="ring" intensity={1.4} color="#ffd9a8" position={[0, 2.6, 0]} rotation-x={Math.PI / 2} scale={0.8} />
      </Environment>
    </>
  );
}

export function Effects() {
  const quality = useStore((s) => s.quality);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.toneMapping = quality === "high" ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;
  }, [gl, quality]);
  if (quality !== "high") return null;
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={0.45} distanceFalloff={0.9} intensity={2.4} quality="medium" halfRes />
      <Bloom luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={0.45} mipmapBlur />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <Vignette offset={0.32} darkness={0.42} />
    </EffectComposer>
  );
}
