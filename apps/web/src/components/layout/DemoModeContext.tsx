import { createContext, useContext, useState, type ReactNode } from "react";

export type DashboardMode = "demo" | "live";

const DemoModeContext = createContext<{ mode: DashboardMode; setMode: (mode: DashboardMode) => void } | null>(null);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<DashboardMode>("demo");
  return <DemoModeContext.Provider value={{ mode, setMode }}>{children}</DemoModeContext.Provider>;
}

export function useDemoMode() {
  const context = useContext(DemoModeContext);
  if (!context) throw new Error("useDemoMode must be used inside DemoModeProvider");
  return context;
}
