import path from "path"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        ws: true,
        configure: (proxy) => {
          proxy.on("error", () => {})
          proxy.on("proxyReqWs", (_proxyReq, _req, socket) => {
            socket.on("error", () => {})
          })
        },
      },
    },
  },
})
