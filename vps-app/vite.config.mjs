import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  cacheDir: fileURLToPath(new URL("../.cache/vite", import.meta.url)),
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8765", "/uploads": "http://127.0.0.1:8765" } },
  build: { outDir: fileURLToPath(new URL("../vps-dist", import.meta.url)), emptyOutDir: true, assetsDir: "assets" },
});
