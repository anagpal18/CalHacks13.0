// Which data the dashboard shows: "demo" (seeded mocks, always works) or "live" (the Creao seat gateway).
// Set by the Demo/Live switch in the header; read by dataSource.ts on every call.

export type DataMode = "demo" | "live";

let currentMode: DataMode = "demo";

export const getDataMode = (): DataMode => currentMode;

export function setDataMode(mode: DataMode) {
  currentMode = mode;
}
