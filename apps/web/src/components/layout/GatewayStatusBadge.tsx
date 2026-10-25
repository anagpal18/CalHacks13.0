// Live mode only: is the gateway up, and can the Creao agents reach it through the tunnel?

import { useEffect, useState } from "react";
import { gatewayClient } from "@/data/gatewayClient";
import { cn } from "@/lib/utils";

type GatewayHealth = "checking" | "ready" | "no-tunnel" | "offline";

const HEALTH_LOOK: Record<GatewayHealth, { label: string; dot: string }> = {
  checking: { label: "Connecting…", dot: "bg-foreground/30" },
  ready: { label: "Agents reachable", dot: "bg-approved" },
  "no-tunnel": { label: "Gateway up, tunnel down", dot: "bg-asking" },
  offline: { label: "Gateway offline", dot: "bg-held" },
};

const POLL_MS = 15_000;

export function GatewayStatusBadge() {
  const [health, setHealth] = useState<GatewayHealth>("checking");

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      gatewayClient
        .getStatus()
        .then((status) => !cancelled && setHealth(status.tunnel?.healthy ? "ready" : "no-tunnel"))
        .catch(() => !cancelled && setHealth("offline"));
    check();
    const interval = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const look = HEALTH_LOOK[health];
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title="Creao seat gateway on port 8787">
      <span className={cn("size-2 rounded-full", look.dot)} />
      {look.label}
    </span>
  );
}
