import { defineConfig } from "vite";

export default defineConfig({
  server: {
    watch: {
      ignored: ["**/.venv/**", "**/backend/__pycache__/**"],
    },
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
