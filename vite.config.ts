import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri sets TAURI_DEV_HOST when it runs on a phone or emulator.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("firebase")) return "vendor-firebase";
            if (id.includes("react") || id.includes("react-dom")) return "vendor-react";
            if (id.includes("docx")) return "vendor-docx";
            if (id.includes("pdf-lib")) return "vendor-pdf";
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: host ? "0.0.0.0" : false,
    hmr: host ? { protocol: "ws", host, port: 5174 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
