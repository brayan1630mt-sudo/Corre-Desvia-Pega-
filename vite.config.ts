import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) {
            return "three-vendor";
          }
          if (
            id.includes("/node_modules/socket.io-client/") ||
            id.includes("/node_modules/engine.io-client/") ||
            id.includes("/node_modules/socket.io-parser/")
          ) {
            return "network-vendor";
          }
          return undefined;
        },
      },
    },
  },
});
