import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 3000,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-512x512.png", "icon-192x192.png"],
      manifest: {
        name: "Chat-ლახი Online",
        short_name: "Chat-ლახი",
        description: "სასაცილო ბარათის თამაში ონლაინ. ითამაშეთ მეგობრებთან ერთად!",
        theme_color: "#1A1F2C",
        background_color: "#1A1F2C",
        display: "standalone",
        orientation: "portrait",
        lang: "ka",
        icons: [
          {
            src: "/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Fonts ship bundled (@fontsource-variable), so woff2 in the precache
        // glob covers them — no runtime caching of external font CDNs needed.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        // Roll out new deploys without users having to manually clear the
        // service worker: as soon as a new SW is precached it takes control
        // (skipWaiting + clientsClaim) and old precaches are purged. Combined
        // with registerType "autoUpdate", a fresh build reaches everyone on
        // their next load instead of being pinned to the cached old bundle.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
