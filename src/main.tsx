/**
 * IMPORTANCIA: inicia React y conecta la aplicación con el nodo HTML `root`.
 *
 * PATRÓN: es el Composition Root del frontend; aquí se ensamblan dependencias
 * globales. La elección de React StrictMode es una solución técnica concreta.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import "./index.css";
import App from "./App.tsx";
import { AuthGate } from "./components/AuthGate.tsx";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPublishableKey) {
  throw new Error("Falta VITE_CLERK_PUBLISHABLE_KEY en el .env del frontend.");
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.error("No se pudo registrar el service worker:", error);
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
      <AuthGate>
        <App />
      </AuthGate>
    </ClerkProvider>
  </StrictMode>,
);
