/**
 * Capacidades del usuario en la organización activa. Las provee
 * PermissionsProvider uniendo los permisos del token de Clerk (`has`) con los
 * efectivos que informa el backend (/me/permissions), que incluyen el rol
 * local "encargado". Al cambiar de organización AuthGate remonta el provider.
 */
import { createContext, useContext } from "react";
import { NO_CAPABILITIES, type Capabilities } from "../utils/permissions";

export type PermissionsState = Capabilities & {
  /** Rol efectivo (org:admin, org:encargado u org:member). */
  role: string | null;
  /** org:admin de Clerk: único que gestiona el equipo. */
  isAdmin: boolean;
};

export const PermissionsContext = createContext<PermissionsState>({
  ...NO_CAPABILITIES,
  role: null,
  isAdmin: false,
});

export function usePermissions(): PermissionsState {
  return useContext(PermissionsContext);
}
