/**
 * IMPORTANCIA: configura el servidor y compilador del frontend.
 * La elección de Vite, React Compiler y Babel es una solución de infraestructura,
 * no un patrón de dominio ni un principio SOLID.
 */
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
});
