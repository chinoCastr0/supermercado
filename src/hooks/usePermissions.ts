/**
 * Capacidades del usuario en la organización activa, leídas del session token
 * de Clerk mediante `has`. Al cambiar de organización Clerk actualiza el token
 * y este hook vuelve a calcularse.
 */
import { useAuth } from "@clerk/react";
import {
  capabilitiesFrom,
  NO_CAPABILITIES,
  type Capabilities,
} from "../utils/permissions";

export function usePermissions(): Capabilities {
  const { isLoaded, has } = useAuth();
  if (!isLoaded || !has) return NO_CAPABILITIES;
  return capabilitiesFrom((permission) => has({ permission }));
}
