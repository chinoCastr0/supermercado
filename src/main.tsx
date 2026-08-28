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

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.error("No se pudo registrar el service worker:", error);
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
