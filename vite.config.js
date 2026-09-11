import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./": depo adı ne olursa olsun GitHub Pages alt yolunda çalışır
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { chunkSizeWarningLimit: 800 },
});
