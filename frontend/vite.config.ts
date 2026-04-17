import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("monaco-editor") || id.includes("@monaco-editor")) {
            return "monaco";
          }
          if (id.includes("marked") || id.includes("highlight.js")) {
            return "markdown-vendor";
          }
          if (id.includes("@tiptap") || id.includes("prosemirror")) {
            return "tiptap";
          }
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("react-router-dom")
          ) {
            return "react-vendor";
          }
          if (id.includes("lucide-react")) {
            return "icons";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
      "/images": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
