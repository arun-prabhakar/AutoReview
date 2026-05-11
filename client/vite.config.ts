import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/recharts")) return "vendor-charts";
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/react-router-dom")) return "vendor-react";
          if (id.includes("node_modules/@reduxjs") || id.includes("node_modules/react-redux")) return "vendor-redux";
          if (id.includes("node_modules/motion")) return "vendor-motion";
          if (id.includes("node_modules/lucide-react")) return "vendor-lucide";
        },
      },
    },
  },
});
