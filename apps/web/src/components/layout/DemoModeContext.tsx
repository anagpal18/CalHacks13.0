// The Demo/Live switch. Demo shows the seeded week (always works, same every time);
// Live reads the Creao seat gateway. dataSource.ts reads the same setting through setDataMode.

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { setDataMode } from "@/data/dataMode";

export type DashboardMode = "demo" | "live";

const DemoModeContext = createContext<{ mode: DashboardMode; setMode: (mode: DashboardMode) => void } | null>(null);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<DashboardMode>("demo");
  const setMode = useCallback((nextMode: DashboardMode) => {
    setDataMode(nextMode); // before re-render, so pages fetch from the new source
    setModeState(nextMode);
  }, []);
  return <DemoModeContext.Provider value={{ mode, setMode }}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (!context) throw new Error("useDemoMode must be used inside DemoModeProvider");
  return context;
}
