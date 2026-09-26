import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

  server: {
    host: "0.0.0.0",
    port: 3000,

    allowedHosts: [".ngrok-free.app", ".ngrok-free.dev"],

    proxy: {
      "/question-paper": {
        target: "https://testing.api.gurudock.com",
        changeOrigin: true,
        secure: true,
      },
      "/assignment": {
        target: "https://testing.api.gurudock.com",
        changeOrigin: true,
        secure: true,
      },
      "/api/lesson-plan": {
        target: "https://testing.api.gurudock.com",
        changeOrigin: true,
        secure: true,
      },
      "/api/feedback": {
        target: "https://testing.api.gurudock.com",
        changeOrigin: true,
        secure: true,
      },
      "/api": {
        target: "https://testing.api.gurudock.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});