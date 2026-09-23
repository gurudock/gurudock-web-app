import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    allowedHosts: [".ngrok-free.dev"],

    proxy: {
      "/api/library": {
        target: "https://testing.api.gurudock.com",
        changeOrigin: true,
      },

      "/api/lesson-plan": {
        target: "https://testing.api.gurudock.com",
        changeOrigin: true,
      },

      "/api": {
        target: "https://testing.api.gurudock.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});