/**
 * IMPORTANCIA: define las reglas estáticas que preservan calidad y consistencia.
 * PRINCIPIO: automatiza restricciones de mantenibilidad; no implementa lógica
 * del negocio. Ignorar backend es específico porque ESLint sólo analiza TS/JS.
 */
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  // SOLUCIÓN ESPECÍFICA: ESLint sólo debe recorrer fuentes JS/TS; los artefactos
  // de Python pueden tener permisos propios y no forman parte de su análisis.
  globalIgnores([
    "dist",
    "backend/**",
    ".pytest_cache/**",
    "**/__pycache__/**",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
]);
