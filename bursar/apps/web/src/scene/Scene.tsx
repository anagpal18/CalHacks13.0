// The Table: one Canvas holding the room, the site outside, the table set and the moving paper.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls, PerformanceMonitor } from "@react-three/drei";
import { useStore } from "../state/store";
import { ROOM, VIEWS } from "./layout";
import { Lighting, Effects } from "./Lighting";
import { AccentWall, Chairs, Credenza, Shell } from "./Room";
import { Site } from "./Site";
import { AgentUnit, ConsentClipboard, Contract, DealBar, Gauge, LogBinder, ReportFolder, Table } from "./TableSet";
import { Cards, Slips } from "./Pieces";
import { Exhibits, Thoughts, Threads } from "./Duel";
import { useClickable } from "./interact";
import { unlockAudio } from "../sound";

/** Keep the table centered in the part of the window the side panel doesn't cover. */
function PanelOffset() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => {
    const { width: w, height: h } = size;
    if (w > 860) camera.setViewOffset(w + 404, h, 404, 0, w, h);
    else camera.setViewOffset(w, h * 1.46, 0, h * 0.46, w, h);
    camera.updateProjectionMatrix();
    return () => { camera.clearViewOffset(); };
  }, [camera, size]);
  return null;
}

function CameraRig() {
  const ref = useRef<CameraControls>(null!);
  const cam = useStore((s) => s.cam);
  useEffect(() => {
    const c = ref.current;
    c.setBoundary(new THREE.Box3(new THREE.Vector3(-ROOM.x + 0.35, 0.35, ROOM.zBack + 0.3), new THREE.Vector3(ROOM.x - 0.35, ROOM.h - 0.15, ROOM.zFront - 0.3)));
    c.setLookAt(...VIEWS.overview.pos, ...VIEWS.overview.target, false);
  }, []);
  useEffect(() => {
    if (cam.nonce === 0) return;
    void ref.current.setLookAt(...cam.pos, ...cam.target, true);
  }, [cam]);
  return (
    <CameraControls
      ref={ref} makeDefault minDistance={0.25} maxDistance={6.2} smoothTime={0.55} draggingSmoothTime={0.12}
      maxPolarAngle={Math.PI * 0.52} boundaryEnclosesCamera dollySpeed={0.6} truckSpeed={1.2}
      onStart={() => useStore.setState({ view: null })}
    />
  );
}

/** Flags the first drawn frame (shaders compiled, shadow maps built) so the loading screen can lift. */
function FirstFrame() {
  const frames = useRef(0);
  useFrame(() => {
    if (++frames.current === 2) useStore.setState({ sceneReady: true });
  });
  return null;
}

/** Clicking the window glass opens the job-site card. */
function WindowHotspot() {
  const { handlers } = useClickable("Job site: Building B", { kind: "spot", id: "window" }, VIEWS.window);
  return (
    <mesh position={[0, 1.725, ROOM.zBack - 0.04]} {...handlers}>
      <planeGeometry args={[9, 1.95]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

export function Scene() {
  const quality = useStore((s) => s.quality);
  return (
    <Canvas
      shadows="soft" dpr={quality === "high" ? [1, 2] : [1, 1.25]} flat
      gl={{ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false }}
      camera={{ fov: 40, near: 0.05, far: 2600, position: VIEWS.overview.pos }}
      onPointerDown={unlockAudio}
      onPointerMissed={() => useStore.getState().select(null)}
    >
      <color attach="background" args={["#c9d3da"]} />
      <fog attach="fog" args={["#d8cdb9", 22, 240]} />
      <PerformanceMonitor onDecline={() => useStore.getState().setQuality("fast")} flipflops={2} />
      <PanelOffset />
      <CameraRig />
      <Lighting />
      <Shell />
      <Site />
      <WindowHotspot />
      <Chairs />
      <Credenza />
      <AccentWall />
      <Table />
      <DealBar />
      <AgentUnit side="contractor" />
      <AgentUnit side="sub" />
      <Gauge />
      <ReportFolder />
      <ConsentClipboard />
      <LogBinder />
      <Contract />
      <Cards />
      <Slips />
      <Exhibits />
      <Threads />
      <Thoughts />
      <Effects />
      <FirstFrame />
    </Canvas>
  );
}
