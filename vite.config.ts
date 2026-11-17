import { defineConfig } from "vite";

// Tauri serves the built files; in development it loads this server.
export default defineConfig({
  clearScreen: false,
  server: { port: 5183, strictPort: true, host: "127.0.0.1", watch: { ignored: ["**/src-tauri/**"] } },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "chrome110", outDir: "dist", sourcemap: false },
});
