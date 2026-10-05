/**
 * Calcula las capacidades de la organización activa. Mientras /me/permissions
 * responde se usan sólo los permisos del token de Clerk; después se suman los
 * del rol local "encargado". El backend valida todo de nuevo.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { membersApi } from "../api/members";
import { PermissionsContext } from "../hooks/usePermissions";
import { capabilitiesFrom, mergedHas } from "../utils/permissions";

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { has, orgRole } = useAuth();
  const [server, setServer] = useState<{ role: string; permissions: string[] } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    membersApi
      .myPermissions()
      .then((result) => {
        if (active) setServer(result);
      })
      .catch(() => {
        // Sin respuesta se conservan los permisos del token; el backend decide.
      });
    return () => {
      active = false;
    };
  }, []);

  const tokenHas = (permission: string) => Boolean(has?.({ permission }));
  const value = {
    ...capabilitiesFrom(mergedHas(tokenHas, server?.permissions ?? null)),
    role: server?.role ?? orgRole ?? null,
    isAdmin: orgRole === "org:admin",
  };
  return (
    <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>
  );
}
