// The public URL the Creao agents use to reach this gateway. A cloudflared quick tunnel gets a new URL on
// every restart, so read the live one from cloudflared's local metrics server, then check it end to end.
export interface TunnelState {
  url?: string;
  healthy: boolean;
  source: "cloudflared" | "BP_GATEWAY_URL" | "none";
}

export function createTunnelProbe(opts: { metricsUrl?: string; fallbackUrl?: string }) {
  const metricsUrl = (opts.metricsUrl ?? "http://127.0.0.1:20241").replace(/\/+$/, "");

  async function current(): Promise<TunnelState> {
    let url = opts.fallbackUrl?.replace(/\/+$/, "");
    let source: TunnelState["source"] = url ? "BP_GATEWAY_URL" : "none";
    try {
      const res = await fetch(`${metricsUrl}/quicktunnel`, { signal: AbortSignal.timeout(1_500) });
      const { hostname } = (await res.json()) as { hostname?: string };
      if (hostname) {
        url = `https://${hostname}`;
        source = "cloudflared";
      }
    } catch {
      // No local cloudflared (for example a deployed gateway): keep the configured URL.
    }
    if (!url) return { healthy: false, source };
    try {
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(8_000) });
      return { url, healthy: res.ok, source };
    } catch {
      return { url, healthy: false, source };
    }
  }

  return { current };
}
