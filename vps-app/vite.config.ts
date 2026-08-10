import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(__dirname),
  publicDir: path.resolve(__dirname, "../public"),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "../vps-dist"),
    emptyOutDir: true,
    assetsDir: "assets",
  },
});
