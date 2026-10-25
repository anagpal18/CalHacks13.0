import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" so the built app also runs from any folder (and as a published artifact).
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { target: "es2022", chunkSizeWarningLimit: 4000, assetsInlineLimit: 120_000 },
  server: { host: "127.0.0.1", port: 5173 },
});
