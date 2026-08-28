/**
 * IMPORTANCIA: configura el servidor y compilador del frontend.
 * La elección de Vite, React Compiler y Babel es una solución de infraestructura,
 * no un patrón de dominio ni un principio SOLID.
 */
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

const apiProxy = {
  "/api": {
    target: "http://127.0.0.1:8000",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ""),
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    proxy: apiProxy,
  },
});
