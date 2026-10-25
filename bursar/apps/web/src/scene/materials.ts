// Shared materials, created once after the fonts load (the canvases need them).

import * as THREE from "three";
import { brushed, ceilingTiles, concrete, grille, ground, leather, plaster, rug, tex, walnut } from "./textures";

let cache: ReturnType<typeof build> | null = null;

function build() {
  const wood = walnut();
  const brassTex = tex(brushed([176, 140, 86], 512, 512, 2)[0]);
  const steelTex = tex(brushed([170, 174, 176], 512, 512, 6)[0]);
  return {
    walnut: new THREE.MeshPhysicalMaterial({ map: wood, bumpMap: wood, bumpScale: 0.4, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.28 }),
    walnutDark: new THREE.MeshStandardMaterial({ map: wood, color: "#8a7a70", roughness: 0.55 }),
    leatherTop: new THREE.MeshStandardMaterial({ map: leather(3), roughness: 0.62 }),
    leatherChair: new THREE.MeshPhysicalMaterial({ color: "#2b211c", roughness: 0.48, sheen: 0.4, sheenRoughness: 0.6, sheenColor: new THREE.Color("#6b5240") }),
    brass: new THREE.MeshStandardMaterial({ map: brassTex, color: "#e2c48e", metalness: 1, roughness: 0.32 }),
    steel: new THREE.MeshStandardMaterial({ map: steelTex, metalness: 1, roughness: 0.38 }),
    blackSteel: new THREE.MeshStandardMaterial({ color: "#1c1e20", metalness: 0.75, roughness: 0.42 }),
    anodized: new THREE.MeshStandardMaterial({ color: "#2a2d30", metalness: 0.6, roughness: 0.35 }),
    grille: new THREE.MeshStandardMaterial({ map: grille(), roughness: 0.95 }),
    floor: new THREE.MeshPhysicalMaterial({ map: concrete(), roughness: 0.36, clearcoat: 0.25, clearcoatRoughness: 0.4 }),
    rug: new THREE.MeshStandardMaterial({ map: rug(), roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ map: plaster("#d5d7d4", 1), roughness: 0.92 }),
    accentWall: new THREE.MeshStandardMaterial({ map: plaster("#3c4845", 2), roughness: 0.9 }),
    ceiling: new THREE.MeshStandardMaterial({ map: ceilingTiles(), roughness: 1 }),
    paperEdge: new THREE.MeshStandardMaterial({ color: "#e9e5da", roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#cfdde4", roughness: 0.03, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false }),
    mullion: new THREE.MeshStandardMaterial({ color: "#2e3134", metalness: 0.7, roughness: 0.4 }),
    ground: new THREE.MeshStandardMaterial({ map: ground(), roughness: 1 }),
    concreteRaw: new THREE.MeshStandardMaterial({ map: concrete(), color: "#b9b6ae", roughness: 0.95 }),
    rebar: new THREE.MeshStandardMaterial({ color: "#6b4a34", metalness: 0.6, roughness: 0.7 }),
    craneYellow: new THREE.MeshStandardMaterial({ color: "#d8a21c", metalness: 0.3, roughness: 0.55 }),
    safetyOrange: new THREE.MeshStandardMaterial({ color: "#d9611e", roughness: 0.6 }),
    whiteMatte: new THREE.MeshStandardMaterial({ color: "#eeeeea", roughness: 0.7 }),
    ceramic: new THREE.MeshPhysicalMaterial({ color: "#f1efe9", roughness: 0.18, clearcoat: 0.6 }),
    coffee: new THREE.MeshStandardMaterial({ color: "#2a160b", roughness: 0.15 }),
    waterGlass: new THREE.MeshPhysicalMaterial({ color: "#eef6f7", roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.28, depthWrite: false }),
    water: new THREE.MeshPhysicalMaterial({ color: "#bcd9de", roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }),
    plant: new THREE.MeshStandardMaterial({ color: "#3d6b3a", roughness: 0.7 }),
    pot: new THREE.MeshStandardMaterial({ color: "#59524a", roughness: 0.85 }),
    hardHat: new THREE.MeshPhysicalMaterial({ color: "#f2c21b", roughness: 0.3, clearcoat: 0.5 }),
  };
}

export const mats = () => (cache ??= build());
export type Mats = ReturnType<typeof build>;
