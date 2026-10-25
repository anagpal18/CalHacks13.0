// Shows the latest failed data call (live mode), e.g. the gateway being down or CRS not configured.

import { TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { DATA_ERROR_EVENT } from "@/hooks/useAsyncData";

export function DataErrorBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    const showError = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    window.addEventListener(DATA_ERROR_EVENT, showError);
    return () => window.removeEventListener(DATA_ERROR_EVENT, showError);
  }, []);

  useEffect(() => setMessage(null), [pathname]);

  if (!message) return null;
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-held/30 bg-card px-4 py-3 text-sm">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-held" />
      <div className="flex-1">
        <span className="font-medium">Live data didn't load.</span> <span className="text-muted-foreground">{message}</span>
      </div>
      <button onClick={() => setMessage(null)} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}
