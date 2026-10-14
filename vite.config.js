import { defineConfig } from "vite";

// VITE_BASE=/<repo>/ for GitHub Pages; "/" in development.
export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  server: { proxy: { "/replay-api": "http://127.0.0.1:5182" } },
});
