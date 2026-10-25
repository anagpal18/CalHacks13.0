// Geometry helpers: paper that lies flat with rounded corners and UVs that map a whole canvas onto it.

import * as THREE from "three";

export function roundedShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function normalizeUV(geo: THREE.BufferGeometry, w: number, h: number) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  uv.needsUpdate = true;
}

/** A face lying flat, facing up (+y). The canvas's top edge points away from the camera (-z). */
export function flatFace(w: number, h: number, r: number) {
  const g = new THREE.ShapeGeometry(roundedShape(w, h, r), 6);
  normalizeUV(g, w, h);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** The same face pointing down, for the back of a card. */
export function flatBack(w: number, h: number, r: number) {
  const g = new THREE.ShapeGeometry(roundedShape(w, h, r), 6);
  normalizeUV(g, w, h);
  g.rotateX(Math.PI / 2);
  return g;
}

/** Hides an extrusion's two caps so the printed faces drawn on top never z-fight with them. Use as material[0]. */
export const HIDDEN_CAPS = new THREE.MeshBasicMaterial({ visible: false });

/** The thin edge of a sheet: extruded outline, centered on y = 0. Group 0 is the caps, group 1 the sides. */
export function sheetEdge(w: number, h: number, r: number, t: number) {
  const g = new THREE.ExtrudeGeometry(roundedShape(w, h, r), { depth: t, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -t / 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** A vertical panel facing +z (signs, boards), canvas top up. */
export function uprightFace(w: number, h: number, r = 0) {
  if (r <= 0) return new THREE.PlaneGeometry(w, h);
  const g = new THREE.ShapeGeometry(roundedShape(w, h, r), 6);
  normalizeUV(g, w, h);
  return g;
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const easeInOut = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
/** A settle with a small overshoot, for things landing on the table. */
export const easeOutBack = (t: number) => { const x = clamp01(t), c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
