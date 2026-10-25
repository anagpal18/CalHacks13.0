// Where things sit in the room, in meters. y is up; the camera's home is on +z looking toward the window wall (-z).
// Contractor sits at the -x end of the table (screen left), the sub at +x (screen right).

export const TABLE = { w: 3.2, d: 1.36, top: 0.752, thick: 0.055 } as const;
export const ROOM = { x: 5, zBack: -3.6, zFront: 4.2, h: 3.0 } as const;

export const CARD = { w: 0.16, h: 0.22, t: 0.0011 } as const;
export const SLIP = { w: 0.22, h: 0.143 } as const;

const COLS = 3;
/** Slots 6 to 10, once the first two rows are full: an outer column, then a third row clear of the offer slips. */
const EXTRA: [number, number][] = [[3, 0], [3, 1], [1, 2], [2, 2], [3, 2]];
/** Grid slot for the nth card on a side. Contractor cards fill from the middle outward toward its end. */
export function slotPosition(side: "contractor" | "sub", slot: number): [number, number] {
  const k = slot % 11;
  const [col, row] = k < 6 ? [k % COLS, Math.floor(k / COLS)] : EXTRA[k - 6];
  const dir = side === "contractor" ? -1 : 1;
  const x = dir * (0.36 + col * 0.19) + (slot >= 11 ? dir * 0.012 : 0);
  const z = -0.36 + row * 0.255 + (slot >= 11 ? 0.012 : 0);
  return [x, z];
}

/** The vendor's exhibits fan out in a row on its side, nearest the middle first. */
export const EXHIBIT = { w: 0.17, h: 0.22 } as const;
export function exhibitPosition(index: number): [number, number, number] {
  const x = 0.42 + (index % 5) * 0.13;
  const z = 0.16 + (index >= 5 ? 0.03 : 0);
  return [x, TABLE.top + 0.0016 + index * 0.0011, z];
}

/** Agent unit (where each side's cards and offers come from). */
export const AGENT_X = 1.42;
export const agentPos = (side: "contractor" | "sub"): [number, number, number] => [side === "contractor" ? -AGENT_X : AGENT_X, TABLE.top + 0.09, 0.0];

/** The brass deal bar runs along x near the front edge: 0% at the contractor end, 50% at the sub end. */
export const DEALBAR = { x0: -0.95, x1: 0.95, z: 0.47 } as const;
export const dealbarX = (pct: number) => DEALBAR.x0 + (Math.max(0, Math.min(50, pct)) / 50) * (DEALBAR.x1 - DEALBAR.x0);

/** Offer slips pile up in the middle; the newest lands on top, slightly turned toward whoever sent it. */
export function slipPosition(index: number, from: "contractor" | "sub", rejected: boolean): [number, number, number] {
  const jitter = ((index * 37) % 11) / 11 - 0.5;
  const x = (from === "contractor" ? -0.07 : 0.07) + jitter * 0.03 + (rejected ? (from === "contractor" ? -0.19 : 0.19) : 0);
  const z = 0.13 + (rejected ? 0.05 : 0) + jitter * 0.02;
  const y = TABLE.top + 0.0008 + index * 0.0009;
  return [x, y, z];
}

export const REPORT_POS: [number, number, number] = [1.17, TABLE.top + 0.004, -0.42];
export const CONTRACT_POS: [number, number, number] = [0, TABLE.top + 0.002, -0.22];
export const GAUGE_POS: [number, number, number] = [0, 2.14, -0.3];

export type ViewId = "overview" | "contractor" | "sub" | "cards" | "room" | "window" | "credenza" | "wall";

export const VIEWS: Record<ViewId, { label: string; pos: [number, number, number]; target: [number, number, number] }> = {
  overview: { label: "Overview", pos: [0, 2.45, 3.45], target: [0, 0.92, -0.2] },
  cards: { label: "The cards", pos: [0, 1.95, 0.95], target: [0, 0.75, -0.08] },
  contractor: { label: "Contractor's seat", pos: [-2.25, 1.28, 0.05], target: [0.6, 0.86, -0.05] },
  sub: { label: "Sub's seat", pos: [2.25, 1.28, 0.05], target: [-0.6, 0.86, -0.05] },
  room: { label: "The room", pos: [3.9, 2.35, 3.35], target: [-0.6, 0.95, -0.9] },
  window: { label: "Job site", pos: [0.9, 1.75, -2.2], target: [-1.2, 4.5, -40] },
  credenza: { label: "Credenza", pos: [-2.6, 1.55, 1.2], target: [-4.6, 1.0, 0.2] },
  wall: { label: "Whiteboard", pos: [2.5, 1.6, 1.15], target: [4.95, 1.45, 0.1] },
};
