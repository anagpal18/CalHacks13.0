// Every surface in the room is drawn here on a canvas: wood, leather, concrete, brass, and all the paper
// (cards, offer slips, the contract, the whiteboard). No image files are loaded.

import * as THREE from "three";
import { fmtUsd, type Card, type ClaimCheck, type ConsentRecord, type Exhibit, type Offer, type SubProfile } from "@terms-room/shared";

export const F = { sans: "Archivo, 'Helvetica Neue', Arial, sans-serif", mono: "'IBM Plex Mono', Menlo, monospace", serif: "'Source Serif 4', Georgia, serif", hand: "Caveat, 'Comic Sans MS', cursive" };
export const INK = { good: "#2e7a4c", warn: "#a86d14", bad: "#b3261e", neutral: "#56626a", contractor: "#2f5d8a", sub: "#b0632d" };

type Ctx = CanvasRenderingContext2D;

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")!];
}

export function tex(c: HTMLCanvasElement, o: { repeat?: [number, number]; color?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...o.repeat); }
  t.needsUpdate = true;
  return t;
}

export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function wrap(g: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (g.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test;
    }
    out.push(line);
  }
  return out;
}

/** Break a long field path at dots and brackets so it wraps cleanly. */
function wrapPath(g: Ctx, path: string, maxW: number): string[] {
  const parts = path.split(/(?<=[.\]])/);
  const out: string[] = [];
  let line = "";
  for (const p of parts) {
    if (g.measureText(line + p).width > maxW && line) { out.push(line); line = p; } else line += p;
  }
  out.push(line);
  return out;
}

function text(g: Ctx, s: string, x: number, y: number, font: string, color: string, o: { align?: CanvasTextAlign; spacing?: number } = {}) {
  g.font = font; g.fillStyle = color; g.textAlign = o.align ?? "left"; g.textBaseline = "alphabetic";
  (g as Ctx & { letterSpacing: string }).letterSpacing = `${o.spacing ?? 0}px`;
  g.fillText(s, x, y);
  (g as Ctx & { letterSpacing: string }).letterSpacing = "0px";
}

function paperGrain(g: Ctx, w: number, h: number, seed: number, base = "#f6f4ee") {
  const r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 900; i++) {
    g.strokeStyle = `rgba(${r() > 0.5 ? "90,80,60" : "255,255,255"},${0.025 + r() * 0.035})`;
    g.lineWidth = 0.6 + r();
    const x = r() * w, y = r() * h, a = r() * Math.PI, l = 3 + r() * 9;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}

// ---------------------------------------------------------------- surfaces

export function walnut() {
  const [c, g] = mk(2048, 1024);
  const r = rng(7);
  const grad = g.createLinearGradient(0, 0, 0, 1024);
  grad.addColorStop(0, "#4f311d"); grad.addColorStop(0.35, "#5f3c24"); grad.addColorStop(0.55, "#553521"); grad.addColorStop(1, "#4a2e1b");
  g.fillStyle = grad; g.fillRect(0, 0, 2048, 1024);
  // book-matched slab: grain flows along x and mirrors across the center seam
  for (let i = 0; i < 620; i++) {
    const y0 = r() * 1024, amp = 4 + r() * 22, f = 0.002 + r() * 0.004, ph = r() * 6.28, amp2 = r() * 6;
    const dark = r() > 0.3;
    g.strokeStyle = dark ? `rgba(28,14,6,${0.05 + r() * 0.2})` : `rgba(160,108,62,${0.03 + r() * 0.07})`;
    g.lineWidth = 0.5 + r() * (dark ? 2.8 : 1.6);
    g.beginPath();
    for (let x = 0; x <= 2048; x += 16) {
      const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 5.3 + ph * 2) * amp2;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  // cathedral figure near the middle of each board
  for (let k = 0; k < 2; k++) {
    const cy = 256 + k * 512;
    for (let j = 0; j < 9; j++) {
      g.strokeStyle = `rgba(30,15,6,${0.12 + j * 0.012})`; g.lineWidth = 2 + r() * 2;
      g.beginPath(); g.ellipse(700 + k * 600 + r() * 60, cy + (r() - 0.5) * 40, 380 - j * 34, 70 - j * 6.5, 0, 0, Math.PI * 2); g.stroke();
    }
  }
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = `rgba(20,10,4,${0.08 + r() * 0.18})`;
    g.fillRect(r() * 2048, r() * 1024, 1 + r() * 4, 0.6 + r() * 0.8);
  }
  const sheen = g.createLinearGradient(0, 0, 2048, 0);
  sheen.addColorStop(0, "rgba(0,0,0,0.12)"); sheen.addColorStop(0.5, "rgba(255,230,200,0.03)"); sheen.addColorStop(1, "rgba(0,0,0,0.12)");
  g.fillStyle = sheen; g.fillRect(0, 0, 2048, 1024);
  return tex(c);
}

export function leather(seed = 3) {
  const [c, g] = mk(512, 768);
  const r = rng(seed);
  g.fillStyle = "#2b1e17"; g.fillRect(0, 0, 512, 768);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(80,58,44,${r() * 0.07})` : `rgba(0,0,0,${r() * 0.09})`;
    g.beginPath(); g.ellipse(r() * 512, r() * 768, 2 + r() * 10, 1 + r() * 6, r() * 3, 0, 6.28); g.fill();
  }
  g.setLineDash([11, 8]); g.strokeStyle = "rgba(196,170,136,0.75)"; g.lineWidth = 3;
  roundRect(g, 20, 20, 472, 728, 14); g.stroke(); g.setLineDash([]);
  return tex(c);
}

export function concrete() {
  const [c, g] = mk(1024, 1024);
  const r = rng(11);
  g.fillStyle = "#8d8c86"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 160; i++) {
    const x = r() * 1024, y = r() * 1024, rad = 40 + r() * 180;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const tone = r() > 0.5 ? "60,58,54" : "190,188,180";
    gr.addColorStop(0, `rgba(${tone},${0.05 + r() * 0.06})`); gr.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 42000; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(40,40,38,${r() * 0.25})` : `rgba(230,228,220,${r() * 0.2})`;
    g.fillRect(r() * 1024, r() * 1024, 1, 1);
  }
  g.strokeStyle = "rgba(50,48,44,0.18)"; g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    let x = r() * 1024, y = r() * 1024;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 14; k++) { x += (r() - 0.5) * 60; y += r() * 40; g.lineTo(x, y); }
    g.stroke();
  }
  return tex(c, { repeat: [3, 3] });
}

export function rug() {
  const [c, g] = mk(1024, 512);
  const r = rng(5);
  g.fillStyle = "#3a4043"; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 30000; i++) {
    g.strokeStyle = r() > 0.5 ? `rgba(90,98,102,${r() * 0.25})` : `rgba(18,22,24,${r() * 0.25})`;
    g.lineWidth = 1; const x = r() * 1024, y = r() * 512;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y + (r() - 0.5) * 4); g.stroke();
  }
  g.strokeStyle = "#5c6265"; g.lineWidth = 22; g.strokeRect(26, 26, 972, 460);
  g.strokeStyle = "rgba(170,140,90,0.5)"; g.lineWidth = 3; g.strokeRect(46, 46, 932, 420);
  return tex(c);
}

export function plaster(base: string, seed: number) {
  const [c, g] = mk(512, 512);
  const r = rng(seed);
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(0,0,0,${r() * 0.035})` : `rgba(255,255,255,${r() * 0.04})`;
    g.fillRect(r() * 512, r() * 512, 1 + r() * 2, 1 + r() * 2);
  }
  return tex(c, { repeat: [4, 2] });
}

export function ceilingTiles() {
  const [c, g] = mk(512, 512);
  const r = rng(9);
  g.fillStyle = "#e7e6e2"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.08})`; g.fillRect(r() * 512, r() * 512, 1.4, 1.4); }
  g.fillStyle = "#c9c7c1";
  for (let k = 0; k <= 512; k += 256) { g.fillRect(k - 3, 0, 6, 512); g.fillRect(0, k - 3, 512, 6); }
  return tex(c, { repeat: [5, 4] });
}

export function brushed(base: [number, number, number], w = 1024, h = 256, seed = 4) {
  const [c, g] = mk(w, h);
  const r = rng(seed);
  g.fillStyle = `rgb(${base.join(",")})`; g.fillRect(0, 0, w, h);
  for (let i = 0; i < h * 6; i++) {
    const d = (r() - 0.5) * 46;
    g.strokeStyle = `rgba(${base.map((v) => Math.max(0, Math.min(255, v + d))).join(",")},0.35)`;
    g.lineWidth = 0.6 + r(); const y = r() * h;
    g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 2); g.stroke();
  }
  return [c, g] as const;
}

function engrave(g: Ctx, s: string, x: number, y: number, font: string, o: { align?: CanvasTextAlign; spacing?: number; dark?: string } = {}) {
  text(g, s, x, y + 1.5, font, "rgba(255,240,200,0.45)", o);
  text(g, s, x, y, font, o.dark ?? "#3a2b14", o);
}

export function dealbarScale(capPct: number | null) {
  const [c, g] = brushed([176, 140, 86], 2048, 176, 21);
  for (let p = 0; p <= 50; p++) {
    const x = 40 + (p / 50) * 1968;
    const len = p % 10 === 0 ? 70 : p % 5 === 0 ? 46 : 24;
    g.fillStyle = "#3a2b14"; g.fillRect(x - 1.5, 10, 3, len);
    g.fillStyle = "rgba(255,240,200,0.4)"; g.fillRect(x + 1.5, 10, 1, len);
    if (p % 10 === 0) engrave(g, `${p}%`, x, 140, `600 46px ${F.sans}`, { align: "center" });
  }
  engrave(g, "UPFRONT", 40, 162, `600 18px ${F.sans}`, { spacing: 4 });
  if (capPct !== null) {
    const x = 40 + (capPct / 50) * 1968;
    g.fillStyle = "#8d1f17"; g.fillRect(x - 4, 0, 8, 96);
    engrave(g, `CAP ${capPct}%`, x + 14, 92, `700 24px ${F.sans}`, { dark: "#8d1f17", spacing: 2 });
  }
  return tex(c);
}

export function grille() {
  const [c, g] = mk(256, 256);
  g.fillStyle = "#26292b"; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 4) for (let x = 0; x < 256; x += 4) {
    g.fillStyle = (x + y) % 8 === 0 ? "#3a3e41" : "#1c1f21"; g.fillRect(x, y, 3, 3);
  }
  return tex(c, { repeat: [3, 1] });
}

export function ground() {
  const [c, g] = mk(512, 512);
  const r = rng(17);
  g.fillStyle = "#8a7a64"; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16000; i++) {
    const v = 80 + r() * 90;
    g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.8},${0.25 + r() * 0.5})`;
    g.beginPath(); g.arc(r() * 512, r() * 512, 0.6 + r() * 2.2, 0, 6.28); g.fill();
  }
  return tex(c, { repeat: [30, 30] });
}

// ---------------------------------------------------------------- paper on the table

const TONE: Record<Card["tone"], string> = { good: INK.good, warn: INK.warn, bad: INK.bad, neutral: INK.neutral };

export function cardFace(card: Card) {
  const W = 768, H = 1056;
  const [c, g] = mk(W, H);
  g.save(); roundRect(g, 0, 0, W, H, 34); g.clip();
  paperGrain(g, W, H, card.id.length * 13 + card.headline.length);
  g.fillStyle = TONE[card.tone]; g.fillRect(0, 0, 16, H);
  text(g, card.title.toUpperCase(), 52, 78, `600 25px ${F.sans}`, "#39434a", { spacing: 2.5 });
  text(g, card.source === "live" ? "CRS Credit API · sandbox persona" : "CRS Credit API · business", 52, 114, `400 23px ${F.sans}`, "#7b858b");
  const tag = card.side === "contractor" ? "PULLED BY CONTRACTOR" : "SHARED BY VENDOR";
  g.font = `600 19px ${F.sans}`;
  const tw = g.measureText(tag).width + 34;
  g.strokeStyle = card.side === "contractor" ? INK.contractor : INK.sub; g.lineWidth = 2.5;
  roundRect(g, W - tw - 40, 142, tw, 40, 20); g.stroke();
  text(g, tag, W - tw / 2 - 40, 169, `600 19px ${F.sans}`, card.side === "contractor" ? INK.contractor : INK.sub, { align: "center", spacing: 1.5 });

  g.font = `700 66px ${F.sans}`;
  let y = 290;
  for (const line of wrap(g, card.headline, W - 110).slice(0, 3)) { text(g, line, 52, y, `700 66px ${F.sans}`, "#14181a"); y += 74; }
  g.font = `400 31px ${F.sans}`;
  y += 12;
  for (const line of wrap(g, card.detail, W - 110).slice(0, 6)) { text(g, line, 52, y, `400 31px ${F.sans}`, "#39434a"); y += 43; }

  const cy = 760;
  g.setLineDash([8, 7]); g.strokeStyle = "#b9bdb8"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(52, cy); g.lineTo(W - 52, cy); g.stroke(); g.setLineDash([]);
  const c0 = card.citations[0];
  text(g, "CITED FIELD", 52, cy + 44, `600 19px ${F.sans}`, "#7b858b", { spacing: 3 });
  g.font = `500 25px ${F.mono}`;
  let py = cy + 82;
  for (const line of wrapPath(g, c0.field, W - 110).slice(0, 2)) { text(g, line, 52, py, `500 25px ${F.mono}`, "#1d2427"); py += 32; }
  text(g, `= ${c0.value}`, 52, py + 26, `500 38px ${F.mono}`, "#14181a");
  text(g, `call ${c0.callId.slice(0, 8)}${card.citations.length > 1 ? ` · +${card.citations.length - 1} more field${card.citations.length > 2 ? "s" : ""}` : ""}`,
    52, H - 52, `400 22px ${F.mono}`, "#7b858b");
  if (card.source === "live") {
    g.font = `700 21px ${F.sans}`;
    const bw = g.measureText("LIVE CRS").width + 30;
    g.fillStyle = "#1f5e44"; roundRect(g, W - 52 - bw, H - 84, bw, 42, 6); g.fill();
    text(g, "LIVE CRS", W - 52 - bw / 2, H - 56, `700 21px ${F.sans}`, "#fbfaf6", { align: "center", spacing: 1.5 });
  }
  g.restore();
  return tex(c);
}

export function cardBack() {
  const W = 768, H = 1056;
  const [c, g] = mk(W, H);
  g.save(); roundRect(g, 0, 0, W, H, 34); g.clip();
  g.fillStyle = "#e3e8e4"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(38,84,80,0.42)"; g.lineWidth = 1.3;
  for (let k = 0; k < 48; k++) {
    g.beginPath();
    for (let t = 0; t <= 720; t++) {
      const a = (t / 720) * Math.PI * 2;
      const rr = 170 + k * 4.2 + Math.sin(a * 12 + k * 0.4) * 34 + Math.sin(a * 5) * 10;
      const x = W / 2 + Math.cos(a) * rr * 0.9, y = H / 2 + Math.sin(a) * rr * 1.18;
      if (t === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.strokeStyle = "#2c5652"; g.lineWidth = 6; roundRect(g, 30, 30, W - 60, H - 60, 22); g.stroke();
  text(g, "CRS EVIDENCE", W / 2, H / 2 + 14, `700 44px ${F.sans}`, "#244744", { align: "center", spacing: 8 });
  text(g, "sandbox · persona data only", W / 2, H / 2 + 56, `400 24px ${F.sans}`, "#3b5e5a", { align: "center", spacing: 1 });
  g.restore();
  return tex(c);
}

/** The sub's full report, face down: a sealed folder the contractor never opens. */
export function reportFolder(held: boolean) {
  const W = 900, H = 640;
  const [c, g] = mk(W, H);
  g.save(); roundRect(g, 0, 0, W, H, 18); g.clip();
  g.fillStyle = held ? "#c7ad7b" : "#cfc9bb"; g.fillRect(0, 0, W, H);
  const r = rng(31);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(90,60,20,${r() * 0.07})`; g.fillRect(r() * W, r() * H, 2, 2); }
  g.strokeStyle = "rgba(90,62,24,0.5)"; g.lineWidth = 3; roundRect(g, 26, 26, W - 52, H - 52, 12); g.stroke();
  text(g, held ? "CONSENTED CREDIT REPORT" : "NO REPORT", W / 2, 180, `700 52px ${F.sans}`, "#4b3414", { align: "center", spacing: 4 });
  text(g, held ? "TransUnion · pulled by the vendor's own agent" : "No signed consent on file", W / 2, 236, `400 30px ${F.sans}`, "#5d4520", { align: "center" });
  g.save(); g.translate(W / 2, 420); g.rotate(-0.08);
  g.strokeStyle = held ? "rgba(150,30,20,0.85)" : "rgba(80,80,80,0.6)"; g.lineWidth = 7;
  roundRect(g, -300, -62, 600, 124, 14); g.stroke();
  text(g, held ? "VENDOR'S EYES ONLY" : "NOT PULLED", 0, 22, `800 62px ${F.sans}`, held ? "rgba(150,30,20,0.85)" : "rgba(80,80,80,0.65)", { align: "center", spacing: 6 });
  g.restore();
  text(g, held ? "Shared on the table: only the facts it allows" : "Consent gate: the vendor's agent can't pull a report", W / 2, H - 70, `500 28px ${F.sans}`, "#5d4520", { align: "center" });
  g.restore();
  return tex(c);
}

const COND: Record<string, string> = { lien_release: "lien release", pay_supplier_direct: "supplier paid direct" };

export function slip(offer: Offer, rejected: boolean, reasons: string[]) {
  const W = 900, H = 585;
  const [c, g] = mk(W, H);
  g.save(); roundRect(g, 0, 0, W, H, 10); g.clip();
  paperGrain(g, W, H, offer.round * 7 + offer.depositPct, offer.from === "contractor" ? "#f2f4f6" : "#f7f2ec");
  g.fillStyle = offer.from === "contractor" ? INK.contractor : INK.sub; g.fillRect(0, 0, W, 12);
  text(g, `ROUND ${offer.round} · ${offer.from === "contractor" ? "CONTRACTOR COUNTER" : "VENDOR OFFER"}`, 40, 62, `600 24px ${F.sans}`, "#3a444a", { spacing: 2.5 });
  text(g, `${offer.depositPct}%`, 40, 170, `700 104px ${F.sans}`, "#14181a");
  g.font = `700 104px ${F.sans}`;
  const dw = g.measureText(`${offer.depositPct}%`).width;
  text(g, "upfront", 40 + dw + 18, 166, `500 34px ${F.sans}`, "#4b555b");
  text(g, `net ${offer.netDays}`, W - 40, 166, `700 50px ${F.sans}`, "#14181a", { align: "right" });
  g.font = `400 26px ${F.sans}`;
  text(g, wrap(g, `${fmtUsd(offer.limitCents)} first-order limit · balance on net ${offer.netDays}`, W - 80)[0], 40, 214, `500 26px ${F.sans}`, "#2f383c");
  let x = 40;
  for (const cnd of offer.conditions) {
    g.font = `600 22px ${F.sans}`;
    const w = g.measureText(COND[cnd]).width + 30;
    g.fillStyle = "#e5e1d6"; roundRect(g, x, 236, w, 38, 19); g.fill();
    text(g, COND[cnd], x + 15, 262, `600 22px ${F.sans}`, "#3a444a");
    x += w + 10;
  }
  g.font = `italic 400 29px ${F.serif}`;
  let y = offer.conditions.length ? 326 : 286;
  for (const line of wrap(g, `“${offer.rationale}”`, W - 80).slice(0, 4)) { text(g, line, 40, y, `italic 400 29px ${F.serif}`, "#2a3236"); y += 38; }
  const shared = offer.sharedCards?.length ?? 0;
  text(g, `cites ${offer.citations.length} CRS fact${offer.citations.length === 1 ? "" : "s"}${shared ? ` · shares ${shared} card` : ""}`, 40, H - 30, `400 21px ${F.mono}`, "#7b858b");
  if (rejected) {
    g.save(); g.translate(W / 2 + 40, H / 2 - 10); g.rotate(-0.16);
    const r = rng(offer.round * 3 + offer.depositPct);
    g.strokeStyle = "rgba(176,34,26,0.88)"; g.lineWidth = 8; roundRect(g, -330, -72, 660, 144, 16); g.stroke();
    text(g, "REJECTED", 0, -2, `800 74px ${F.sans}`, "rgba(176,34,26,0.88)", { align: "center", spacing: 10 });
    text(g, "BY THE GATEWAY", 0, 46, `700 30px ${F.sans}`, "rgba(176,34,26,0.88)", { align: "center", spacing: 8 });
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 260; i++) { g.beginPath(); g.arc((r() - 0.5) * 680, (r() - 0.5) * 150, r() * 3.5, 0, 6.28); g.fill(); }
    g.globalCompositeOperation = "source-over";
    g.restore();
    g.font = `500 21px ${F.sans}`;
    text(g, wrap(g, reasons[0] ?? "", W - 80)[0], 40, H - 62, `500 21px ${F.sans}`, "#a3271f");
  }
  g.restore();
  return tex(c);
}

export interface ContractView {
  sub: SubProfile; contractor: string; project: string; terms: Offer; depositCents: number; rounds: number; negotiationId: string;
  signed: number; approvedBy?: string[]; transferId?: string; citations: number;
}

function signature(g: Ctx, x: number, y: number, seed: number, progress: number, color: string) {
  const r = rng(seed);
  const pts: [number, number][] = [];
  let px = x, py = y;
  for (let i = 0; i < 48; i++) { px += 6 + r() * 9; py = y + Math.sin(i * 0.9 + r()) * (10 + r() * 16) - (i < 6 ? i * 2 : 0); pts.push([px, py]); }
  const n = Math.floor(pts.length * progress);
  if (n < 2) return;
  g.strokeStyle = color; g.lineWidth = 3.2; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i < n; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

export function contract(v: ContractView) {
  const W = 1000, H = 1414;
  const [c, g] = mk(W, H);
  paperGrain(g, W, H, 77, "#fbfaf6");
  g.strokeStyle = "#1f2a2e"; g.lineWidth = 2; g.strokeRect(46, 46, W - 92, H - 92);
  text(g, "VENDOR TERMS AGREEMENT", W / 2, 140, `600 40px ${F.serif}`, "#1b2326", { align: "center", spacing: 3 });
  text(g, `${v.project} · ${v.negotiationId}`, W / 2, 184, `400 22px ${F.mono}`, "#5f696e", { align: "center" });
  const rows: [string, string][] = [
    ["Contractor", v.contractor],
    ["Vendor", `${v.sub.business} (${v.sub.contact.replace(/\b(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase())})`],
    ["Scope", v.sub.scope],
    ["Payment terms", `Net ${v.terms.netDays}`],
    ["Upfront", `${v.terms.depositPct}% · ${fmtUsd(v.depositCents)}`],
    ["First-order limit", fmtUsd(v.terms.limitCents)],
    ["Balance", v.terms.schedule.map((m) => `${m.pct}% ${m.label.toLowerCase()}`).join("; ") || "none"],
    ["Conditions", v.terms.conditions.length ? v.terms.conditions.map((x) => COND[x]).join("; ") : "None"],
  ];
  let y = 270;
  for (const [k, val] of rows) {
    text(g, k.toUpperCase(), 90, y, `600 20px ${F.sans}`, "#6a7479", { spacing: 2 });
    g.font = `400 31px ${F.serif}`;
    const lines = wrap(g, val, W - 420);
    lines.slice(0, 2).forEach((l, i) => text(g, l, 330, y + i * 38, `400 31px ${F.serif}`, "#1b2326"));
    y += 38 * Math.min(2, lines.length) + 26;
    g.strokeStyle = "#e1ddd2"; g.lineWidth = 1; g.beginPath(); g.moveTo(90, y - 30); g.lineTo(W - 90, y - 30); g.stroke();
  }
  g.font = `italic 400 26px ${F.serif}`;
  wrap(g, `Agreed in ${v.rounds} round${v.rounds > 1 ? "s" : ""}. Every offer cited CRS facts from the call log (${v.citations} citations in all), and the gateway checked each one before it reached the table.`, W - 180)
    .forEach((l, i) => text(g, l, 90, y + 10 + i * 34, `italic 400 26px ${F.serif}`, "#3c464b"));
  const sy = 1110;
  for (const [i, who] of [[0, `Contractor agent, for ${v.contractor}`], [1, `Vendor agent, for ${v.sub.business}`]] as const) {
    const x = 90 + i * 430;
    signature(g, x + 10, sy - 20, 100 + i * 9, Math.max(0, Math.min(1, v.signed * 2 - i)), i === 0 ? "#1f3f66" : "#5a2a12");
    g.strokeStyle = "#1b2326"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, sy); g.lineTo(x + 380, sy); g.stroke();
    g.font = `400 20px ${F.sans}`;
    wrap(g, who, 380).forEach((l, k) => text(g, l, x, sy + 32 + k * 24, `400 20px ${F.sans}`, "#5f696e"));
  }
  if (v.approvedBy) {
    g.save(); g.translate(W - 250, 1290); g.rotate(-0.12);
    g.strokeStyle = "rgba(30,110,60,0.9)"; g.lineWidth = 7; roundRect(g, -190, -58, 380, 116, 14); g.stroke();
    text(g, "APPROVED", 0, 4, `800 56px ${F.sans}`, "rgba(30,110,60,0.9)", { align: "center", spacing: 8 });
    text(g, v.approvedBy.join(" + "), 0, 42, `600 19px ${F.sans}`, "rgba(30,110,60,0.9)", { align: "center" });
    g.restore();
  }
  if (v.transferId) text(g, `Upfront sent · ${v.transferId}`, 90, 1316, `400 20px ${F.mono}`, "#2e6b45");
  return tex(c);
}

// ---------------------------------------------------------------- the room

export interface BoardRow { round: number; sub?: string; us?: string; rejected?: string; }

export function whiteboard(title: string, rows: BoardRow[], outcome: { text: string; color: string } | null) {
  const W = 1600, H = 1000;
  const [c, g] = mk(W, H);
  g.fillStyle = "#f4f6f6"; g.fillRect(0, 0, W, H);
  const r = rng(51);
  for (let i = 0; i < 26; i++) { // ghosts of old meetings
    g.strokeStyle = `rgba(120,130,140,${0.03 + r() * 0.04})`; g.lineWidth = 6 + r() * 14; g.lineCap = "round";
    g.beginPath(); const x = r() * W, y = r() * H; g.moveTo(x, y); g.quadraticCurveTo(x + r() * 300, y + (r() - 0.5) * 120, x + 120 + r() * 400, y + (r() - 0.5) * 60); g.stroke();
  }
  const blue = "#1d4b9c", red = "#c3262d", black = "#202326", green = "#1c7a3e";
  text(g, title, 70, 120, `700 82px ${F.hand}`, blue);
  g.strokeStyle = blue; g.lineWidth = 5; g.beginPath(); g.moveTo(70, 140); g.quadraticCurveTo(600, 152, 1180, 136); g.stroke();
  const cols = [70, 260, 760, 1250];
  ["Rd", "Vendor asks", "We offer", ""].forEach((h, i) => text(g, h, cols[i], 230, `700 54px ${F.hand}`, black));
  g.strokeStyle = black; g.lineWidth = 3; g.beginPath(); g.moveTo(60, 250); g.lineTo(1540, 254); g.stroke();
  let y = 330;
  for (const row of rows) {
    text(g, String(row.round), cols[0] + 14, y, `600 58px ${F.hand}`, black);
    if (row.sub) text(g, row.sub, cols[1], y, `500 54px ${F.hand}`, "#9a4a1c");
    if (row.rejected) {
      text(g, row.rejected, cols[2], y, `500 54px ${F.hand}`, red);
      g.font = `500 54px ${F.hand}`;
      const w = g.measureText(row.rejected).width;
      g.strokeStyle = red; g.lineWidth = 5; g.beginPath(); g.moveTo(cols[2] - 8, y - 16); g.lineTo(cols[2] + w + 8, y - 22); g.stroke();
      text(g, "← gateway: no", cols[2] + w + 24, y, `600 44px ${F.hand}`, red);
      y += 70;
    }
    if (row.us) text(g, row.us, cols[2], y, `500 54px ${F.hand}`, blue);
    y += 84;
  }
  if (outcome) {
    text(g, outcome.text, 70, Math.min(y + 60, 940), `700 70px ${F.hand}`, outcome.color);
    g.font = `700 70px ${F.hand}`;
    const w = g.measureText(outcome.text).width;
    g.strokeStyle = outcome.color; g.lineWidth = 5;
    g.beginPath(); g.ellipse(70 + w / 2, Math.min(y + 60, 940) - 22, w / 2 + 40, 60, -0.03, 0, Math.PI * 2); g.stroke();
  }
  g.fillStyle = green; g.fillRect(1440, 948, 120, 14); // the green marker's cap, left on the tray
  return tex(c);
}

export function plaque(title: string, rules: [string, string][]) {
  const [c, g] = brushed([188, 191, 192], 900, 700, 8);
  g.strokeStyle = "rgba(40,44,46,0.6)"; g.lineWidth = 4; g.strokeRect(24, 24, 852, 652);
  const ink = { dark: "#23282b" };
  engrave(g, title, 60, 106, `700 50px ${F.sans}`, { ...ink, spacing: 6 });
  engrave(g, "Enforced in code by the gateway, not by the agents", 60, 148, `400 24px ${F.sans}`, ink);
  rules.slice(0, 7).forEach(([a, b], i) => {
    const y = 226 + i * 64;
    engrave(g, a, 60, y, `500 29px ${F.sans}`, ink);
    engrave(g, b, 840, y, `700 29px ${F.sans}`, { ...ink, align: "right" });
    g.fillStyle = "rgba(40,44,46,0.25)"; g.fillRect(60, y + 18, 780, 2);
  });
  return tex(c);
}

export function nameplate(role: string, worksFor: string, side: "contractor" | "sub") {
  const [c, g] = brushed([182, 146, 92], 1024, 240, side === "contractor" ? 14 : 15);
  g.strokeStyle = "rgba(58,43,20,0.7)"; g.lineWidth = 5; g.strokeRect(14, 14, 996, 212);
  engrave(g, role, 512, 112, `700 64px ${F.sans}`, { align: "center", spacing: 7 });
  engrave(g, `works for ${worksFor}`, 512, 176, `500 36px ${F.sans}`, { align: "center" });
  return tex(c);
}

export function gaugeFace() {
  const S = 1024, cx = S / 2, cy = S / 2;
  const [c, g] = mk(S, S);
  const grd = g.createRadialGradient(cx, cy - 80, 40, cx, cy, S / 2);
  grd.addColorStop(0, "#f5f3ec"); grd.addColorStop(1, "#dedbd0");
  g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, S / 2, 0, 6.28); g.fill();
  const ang = (v: number) => (-135 + (v / 100) * 270 - 90) * (Math.PI / 180);
  const band = (a: number, b: number, col: string) => { g.strokeStyle = col; g.lineWidth = 40; g.beginPath(); g.arc(cx, cy, 380, ang(a), ang(b)); g.stroke(); };
  band(0, 35, "#b8473d"); band(35, 65, "#c99a3a"); band(65, 100, "#4f8a5d");
  for (let v = 0; v <= 100; v += 2) {
    const a = ang(v), l = v % 10 === 0 ? 62 : 30;
    g.strokeStyle = "#1d2124"; g.lineWidth = v % 10 === 0 ? 7 : 3;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * 412, cy + Math.sin(a) * 412); g.lineTo(cx + Math.cos(a) * (412 - l), cy + Math.sin(a) * (412 - l)); g.stroke();
    if (v % 20 === 0) text(g, String(v), cx + Math.cos(a) * 300, cy + Math.sin(a) * 300 + 22, `600 62px ${F.sans}`, "#1d2124", { align: "center" });
  }
  text(g, "TRUST", cx, cy + 190, `700 64px ${F.sans}`, "#1d2124", { align: "center", spacing: 12 });
  text(g, "from CRS-checked claims", cx, cy + 244, `400 32px ${F.sans}`, "#5d666b", { align: "center" });
  text(g, "KEYSTONE BAY · BURSAR", cx, cy + 330, `600 22px ${F.sans}`, "#8a9196", { align: "center", spacing: 4 });
  return tex(c);
}

export function consentForm(consent: ConsentRecord | null, sub: SubProfile | undefined, scope: string) {
  const W = 850, H = 1100;
  const [c, g] = mk(W, H);
  paperGrain(g, W, H, 61, "#fbfbf8");
  text(g, "CONSENT TO SHARE", 60, 110, `700 44px ${F.sans}`, "#1b2326", { spacing: 3 });
  text(g, "CREDIT INFORMATION", 60, 160, `700 44px ${F.sans}`, "#1b2326", { spacing: 3 });
  text(g, "FCRA permissible purpose: the vendor's written instruction", 60, 206, `400 24px ${F.sans}`, "#5f696e");
  const field = (k: string, v: string, y: number) => {
    text(g, k.toUpperCase(), 60, y, `600 19px ${F.sans}`, "#6a7479", { spacing: 2 });
    text(g, v, 60, y + 40, `400 30px ${F.serif}`, "#1b2326");
    g.strokeStyle = "#c9c6bc"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(60, y + 54); g.lineTo(W - 60, y + 54); g.stroke();
  };
  field("Vendor", sub ? `${sub.business}` : "", 280);
  field("Signer", consent ? consent.signedBy : "", 380);
  field("Shares", consent ? scope : "", 480);
  g.font = `400 26px ${F.serif}`;
  wrap(g, consent?.purpose ?? "Not signed. Without consent the vendor's agent can't pull a credit report, so nothing is shared.", W - 120)
    .forEach((l, i) => text(g, l, 60, 610 + i * 36, `400 26px ${F.serif}`, "#2f383c"));
  if (consent) {
    signature(g, 70, 930, 300, 1, "#1f3466");
    text(g, `Signed ${consent.signedAt.slice(0, 10)} · expires ${consent.expiresAt.slice(0, 10)}`, 60, 1010, `400 22px ${F.mono}`, "#5f696e");
  } else {
    g.save(); g.translate(W / 2, 930); g.rotate(-0.1);
    g.strokeStyle = "rgba(90,90,90,0.55)"; g.lineWidth = 6; roundRect(g, -230, -54, 460, 108, 12); g.stroke();
    text(g, "NOT SIGNED", 0, 20, `800 58px ${F.sans}`, "rgba(90,90,90,0.6)", { align: "center", spacing: 6 });
    g.restore();
  }
  return tex(c);
}

export function binderCover() {
  const W = 620, H = 800;
  const [c, g] = mk(W, H);
  const r = rng(71);
  g.fillStyle = "#1f2d40"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.05})`; g.fillRect(r() * W, r() * H, 1, 3); }
  g.fillStyle = "#f2efe6"; roundRect(g, 70, 150, W - 140, 300, 10); g.fill();
  text(g, "CRS CALL LOG", W / 2, 250, `700 50px ${F.sans}`, "#1f2d40", { align: "center", spacing: 5 });
  text(g, "Data use · every call,", W / 2, 312, `400 30px ${F.sans}`, "#3a4656", { align: "center" });
  text(g, "its purpose and its result", W / 2, 352, `400 30px ${F.sans}`, "#3a4656", { align: "center" });
  text(g, "No headers. No tokens.", W / 2, 410, `600 24px ${F.mono}`, "#3a4656", { align: "center" });
  return tex(c);
}

export function folderTab(sub: { persona: string; business: string; trade: string }, color: string) {
  const W = 700, H = 230;
  const [c, g] = mk(W, H);
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  const r = rng(sub.persona.charCodeAt(2) * 31);
  for (let i = 0; i < 2400; i++) { g.fillStyle = `rgba(80,55,20,${r() * 0.07})`; g.fillRect(r() * W, r() * H, 2, 2); }
  g.fillStyle = "#fbfaf4"; g.fillRect(30, 40, W - 60, 150);
  text(g, sub.business, 54, 108, `700 46px ${F.sans}`, "#1b2326");
  text(g, `${sub.persona} · ${sub.trade}`, 54, 162, `400 32px ${F.mono}`, "#4b555b");
  return tex(c);
}

export function banner(lines: string[]) {
  const W = 2048, H = 300;
  const [c, g] = mk(W, H);
  g.fillStyle = "#1f4d36"; g.fillRect(0, 0, W, H);
  const r = rng(91);
  for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.18})`; g.fillRect(r() * W, r() * H, 2, 2); }
  text(g, lines[0], 60, 130, `800 104px ${F.sans}`, "#f2f2ec", { spacing: 6 });
  text(g, lines[1], 64, 230, `600 58px ${F.sans}`, "#d9e6dc", { spacing: 3 });
  return tex(c);
}

export function sitePlan() {
  const W = 1200, H = 820;
  const [c, g] = mk(W, H);
  g.fillStyle = "#1c3b66"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(200,220,255,0.12)"; g.lineWidth = 1;
  for (let x = 0; x < W; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = "#e6eefc"; g.lineWidth = 4; g.strokeRect(220, 170, 560, 380);
  g.lineWidth = 2; for (let x = 290; x < 780; x += 70) { g.beginPath(); g.moveTo(x, 170); g.lineTo(x, 550); g.stroke(); }
  g.strokeRect(820, 260, 200, 200); g.setLineDash([12, 10]); g.strokeRect(150, 110, 920, 520); g.setLineDash([]);
  text(g, "BUILDING B", 500, 380, `700 40px ${F.sans}`, "#e6eefc", { align: "center", spacing: 6 });
  text(g, "CRANE PAD", 920, 370, `600 22px ${F.sans}`, "#e6eefc", { align: "center" });
  g.strokeStyle = "#e6eefc"; g.lineWidth = 2; g.strokeRect(40, 680, W - 80, 100);
  text(g, "SHEET A-101 · SITE PLAN · ALAMEDA MIXED-USE", 60, 742, `600 30px ${F.sans}`, "#e6eefc", { spacing: 3 });
  return tex(c);
}

export function receipt(transferId: string, amountCents: number, payee: string, at: string) {
  const W = 360, H = 760;
  const [c, g] = mk(W, H);
  paperGrain(g, W, H, 13, "#f7f7f2");
  const line = (s: string, y: number, bold = false) => text(g, s, 26, y, `${bold ? 600 : 400} ${bold ? 26 : 21}px ${F.mono}`, "#26292b");
  line("NESSIE TRANSFER", 60, true);
  line("via Capital One Nessie", 94);
  line("- - - - - - - - - - - -", 160);
  line("UPFRONT", 205, true);
  text(g, fmtUsd(amountCents), 26, 262, `600 48px ${F.mono}`, "#14181a");
  line("TO", 320, true); g.font = `400 21px ${F.mono}`;
  wrap(g, payee, W - 52).forEach((l, i) => line(l, 350 + i * 26));
  line("ID", 440, true); line(transferId, 470);
  line("AT", 520, true); line(at.replace("T", " ").slice(0, 19), 550);
  line("- - - - - - - - - - - -", 600);
  line("approved by controller", 640);
  return tex(c);
}

export function clockFace() {
  const S = 512, cx = 256, cy = 256;
  const [c, g] = mk(S, S);
  g.fillStyle = "#f4f4f1"; g.beginPath(); g.arc(cx, cy, 256, 0, 6.28); g.fill();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, l = i % 5 === 0 ? 30 : 12;
    g.strokeStyle = "#1d2124"; g.lineWidth = i % 5 === 0 ? 8 : 3;
    g.beginPath(); g.moveTo(cx + Math.sin(a) * 238, cy - Math.cos(a) * 238); g.lineTo(cx + Math.sin(a) * (238 - l), cy - Math.cos(a) * (238 - l)); g.stroke();
  }
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    text(g, String(h), cx + Math.sin(a) * 178, cy - Math.cos(a) * 178 + 18, `600 52px ${F.sans}`, "#1d2124", { align: "center" });
  }
  return tex(c);
}

export function labelTex(s: string, o: { w?: number; h?: number; bg?: string; fg?: string; size?: number } = {}) {
  const W = o.w ?? 1024, H = o.h ?? 160;
  const [c, g] = mk(W, H);
  g.fillStyle = o.bg ?? "#f2f2ee"; g.fillRect(0, 0, W, H);
  text(g, s, W / 2, H / 2 + (o.size ?? 64) * 0.36, `700 ${o.size ?? 64}px ${F.sans}`, o.fg ?? "#1b2326", { align: "center", spacing: 4 });
  return tex(c);
}

// ---------------------------------------------------------------- the duel

const VERDICT_INK: Record<string, string> = { verified: INK.good, contradicted: INK.bad, unverified: "#6b7378", pending: "#9aa1a5" };
const DOC_TINT: Record<string, string> = { w9: "#f7f7f2", license: "#f4f1e6", reference: "#f8f6f0", invoices: "#f3f5f6", bank_letter: "#f6f4f7", credit_facts: "#f1f5f2" };

/** A vendor exhibit as a sheet of paper: its header, the fields it claims, a mark beside each claim once CRS has
 *  checked it, and a stamp when anything was contradicted. */
export function exhibitSheet(x: Exhibit, checks: ClaimCheck[]) {
  const W = 816, H = 1056;
  const [c, g] = mk(W, H);
  g.save(); roundRect(g, 0, 0, W, H, 14); g.clip();
  paperGrain(g, W, H, x.id.length * 17 + x.claims.length, DOC_TINT[x.kind] ?? "#f7f7f2");
  const judge = x.from === "judge";
  g.fillStyle = judge ? "#5b3f8c" : INK.sub; g.fillRect(0, 0, W, 14);
  text(g, `${x.label.toUpperCase()}${judge ? " · FROM THE JUDGE" : ""}`, 48, 74, `700 26px ${F.sans}`, judge ? "#5b3f8c" : INK.sub, { spacing: 3 });
  if (x.kind === "w9") {
    g.strokeStyle = "#1b2326"; g.lineWidth = 3; g.strokeRect(48, 104, W - 96, 120);
    text(g, "Form W-9", 70, 160, `700 54px ${F.serif}`, "#14181a");
    text(g, "Request for Taxpayer Identification Number and Certification", 70, 200, `400 22px ${F.sans}`, "#3a444a");
  } else {
    let size = 52;
    for (; size > 30; size -= 2) { g.font = `700 ${size}px ${F.serif}`; if (g.measureText(x.title).width <= W - 96) break; }
    text(g, x.title, 48, 168, `700 ${size}px ${F.serif}`, "#14181a");
    g.strokeStyle = "#c9c4b6"; g.lineWidth = 2; g.beginPath(); g.moveTo(48, 196); g.lineTo(W - 48, 196); g.stroke();
  }
  let y = 286;
  for (const [k, v] of (x.fields ?? []).slice(0, 4)) {
    text(g, k.toUpperCase(), 48, y, `600 19px ${F.sans}`, "#6a7479", { spacing: 2 });
    g.font = `400 30px ${F.serif}`;
    const lines = wrap(g, v, W - 96).slice(0, 2);
    lines.forEach((l, i) => text(g, l, 48, y + 38 + i * 34, `400 30px ${F.serif}`, "#1b2326"));
    y += 52 + lines.length * 34;
  }
  y = Math.max(y + 10, 640);
  text(g, "CROSS-EXAMINED BY CRS", 48, y, `600 19px ${F.sans}`, "#6a7479", { spacing: 3 });
  y += 18;
  for (const cl of x.claims.slice(0, 4)) {
    const ck = checks.find((k) => k.claimId === cl.id);
    const v = ck?.verdict ?? "pending";
    y += 52;
    g.fillStyle = VERDICT_INK[v]; g.beginPath(); g.arc(68, y - 10, 15, 0, 6.28); g.fill();
    text(g, v === "verified" ? "✓" : v === "contradicted" ? "✕" : v === "unverified" ? "?" : "·", 68, y - 1, `700 22px ${F.sans}`, "#fff", { align: "center" });
    g.font = `500 25px ${F.sans}`;
    text(g, wrap(g, cl.text, W - 300)[0], 98, y - 2, `500 25px ${F.sans}`, "#1b2326");
    if (ck) text(g, v.toUpperCase(), W - 48, y - 2, `700 21px ${F.sans}`, VERDICT_INK[v], { align: "right", spacing: 1.5 });
  }
  if (x.fileName) text(g, `file: ${x.fileName} · stays in the browser`, 48, H - 44, `400 20px ${F.mono}`, "#7b858b");
  else text(g, judge ? "handed in by the judge" : "played by the vendor's agent", 48, H - 44, `400 20px ${F.mono}`, "#7b858b");
  if (checks.some((k) => k.verdict === "contradicted")) {
    g.save(); g.translate(W / 2 + 30, 470); g.rotate(-0.18);
    const r = rng(x.id.length * 7);
    g.strokeStyle = "rgba(176,34,26,0.86)"; g.lineWidth = 9; roundRect(g, -300, -70, 600, 140, 16); g.stroke();
    text(g, "CONTRADICTED", 0, 4, `800 70px ${F.sans}`, "rgba(176,34,26,0.86)", { align: "center", spacing: 6 });
    text(g, "BY CRS", 0, 50, `700 28px ${F.sans}`, "rgba(176,34,26,0.86)", { align: "center", spacing: 10 });
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 240; i++) { g.beginPath(); g.arc((r() - 0.5) * 620, (r() - 0.5) * 150, r() * 3.5, 0, 6.28); g.fill(); }
    g.globalCompositeOperation = "source-over";
    g.restore();
  } else if (checks.length && checks.length >= x.claims.length && checks.every((k) => k.verdict === "verified")) {
    g.save(); g.translate(W - 190, 470); g.rotate(-0.12);
    g.strokeStyle = "rgba(30,110,60,0.8)"; g.lineWidth = 7; roundRect(g, -150, -52, 300, 104, 14); g.stroke();
    text(g, "VERIFIED", 0, 18, `800 52px ${F.sans}`, "rgba(30,110,60,0.8)", { align: "center", spacing: 4 });
    g.restore();
  }
  g.restore();
  return tex(c);
}

