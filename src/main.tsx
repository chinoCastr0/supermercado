/**
 * IMPORTANCIA: inicia React y conecta la aplicación con el nodo HTML `root`.
 *
 * PATRÓN: es el Composition Root del frontend; aquí se ensamblan dependencias
 * globales. La elección de React StrictMode es una solución técnica concreta.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
