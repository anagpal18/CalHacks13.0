import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// The repo-root .env holds BP_DASHBOARD_KEY. It is read here, in the dev server, and added to every
// /dashboard/* request on its way to the gateway, so the key never reaches the browser.
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(__dirname, "../.."), "");
  const gatewayUrl = rootEnv.BP_GATEWAY_LOCAL_URL || "http://127.0.0.1:8787";

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    server: {
      port: 5173,
      proxy: {
        "/dashboard": {
          target: gatewayUrl,
          changeOrigin: true,
          // No X-Forwarded-For: the gateway refuses proxied-looking requests carrying the dashboard key.
          xfwd: false,
          headers: { Authorization: `Bearer ${rootEnv.BP_DASHBOARD_KEY ?? ""}` },
        },
      },
    },
  };
});
