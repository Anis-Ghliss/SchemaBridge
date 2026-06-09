import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/reactflow")) return "vendor-reactflow";
          if (id.includes("node_modules/@codemirror") || id.includes("node_modules/@uiw")) return "vendor-codemirror";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/scheduler")) return "vendor-react";
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
