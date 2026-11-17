import { defineConfig } from "vite";

// Tauri serves the built files; in development it loads this server.
export default defineConfig({
  clearScreen: false,
  server: { port: 5183, strictPort: true, host: "127.0.0.1", watch: { ignored: ["**/src-tauri/**", "**/crates/**", "**/target/**", "**/dist/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "chrome110",
    outDir: "dist",
    sourcemap: false,
    // The pages: the island, picture-in-picture, the alarm's card, the rest screen.
    rollupOptions: { input: { main: "index.html", pip: "pip.html", alert: "alert.html", rest: "rest.html" } },
  },
});
