// Resolve a citation field path against a stored CRS response.
// Paths look like "risk.score", "data.records[0].lastName" or "addOnProducts[0].idManagerVerification.messages.length".
// One derived form exists for selective sharing: "band50(scores[0].scoreValue)" returns the 50-point band
// ("750-799") so the sub can prove a band without revealing the exact score.

export function resolveField(obj: unknown, field: string): string | undefined {
  const band = /^band(\d+)\((.+)\)$/.exec(field);
  if (band) {
    const raw = resolveField(obj, band[2]);
    const n = Number(raw);
    if (raw === undefined || !Number.isFinite(n)) return undefined;
    const width = Number(band[1]);
    const lo = Math.floor(n / width) * width;
    return `${lo}-${lo + width - 1}`;
  }
  const parts = field.match(/[^.[\]]+|\[\d+\]/g) ?? [];
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    const key = p.startsWith("[") ? Number(p.slice(1, -1)) : p;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  if (cur === null || cur === undefined || typeof cur === "object") return undefined;
  return String(cur);
}

/** PitchPoint's XML-derived JSON gives a single record as an object and several as an array. */
export function asList<T>(x: T | T[] | undefined | null | ""): T[] {
  if (x === undefined || x === null || x === "") return [];
  return Array.isArray(x) ? x : [x];
}
