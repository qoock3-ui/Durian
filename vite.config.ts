import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // `npm run dev` 時把 API 轉給 `wrangler dev`(需另開一個終端跑 wrangler dev)
      "/api": "http://localhost:8787",
    },
  },
});
