/**
 * Tapa toda la app hasta que haya una sesión de Clerk activa.
 * No hay rutas públicas: el formulario de login reemplaza el contenido entero.
 */
import type { ReactNode } from "react";
import { SignIn, useAuth } from "@clerk/react";

type Props = { children: ReactNode };

export function AuthGate({ children }: Props) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;

  if (!isSignedIn) {
    return (
      <div className="auth-gate">
        <SignIn />
      </div>
    );
  }

  return children;
}
