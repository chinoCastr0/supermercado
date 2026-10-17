/**
 * Capacidades del rol activo más permisos explícitos. Cada respuesta queda ligada
 * a usuario/organización; nunca reutiliza permisos de otra sesión u organización.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/react";
import { membersApi } from "../api/members";
import { PermissionsContext } from "../hooks/usePermissions";
import { capabilitiesFrom, effectivePermissions } from "../utils/permissions";
import type { MyPermissions } from "../types/member";
import { NoticeBanner } from "./NoticeBanner";

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { has, orgRole, orgId, userId } = useAuth();
  const scope = orgId && userId ? `${orgId}:${userId}:${orgRole ?? ""}` : null;
  const [server, setServer] = useState<{ scope: string; data: MyPermissions } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!scope || !orgId || !userId) return;
    let active = true;
    membersApi.myPermissions().then((result) => {
      if (!active) return;
      if (result.organization_id !== orgId || result.user_id !== userId) {
        setFailure(scope);
        return;
      }
      setServer({ scope, data: result });
      setFailure(null);
    }).catch(() => {
      if (active) setFailure(scope);
    });
    return () => { active = false; };
  }, [scope, orgId, userId, retry]);

  const current = server?.scope === scope ? server.data : null;
  // Clerk define admin/member. Sólo el backend puede elevar member a encargado.
  const role = !scope ? null : orgRole === "org:member" && current?.role === "org:encargado"
    ? current.role : orgRole ?? null;
  const tokenHas = (permission: string) => Boolean(has?.({ permission }));
  const value = {
    ...capabilitiesFrom(effectivePermissions(role, tokenHas, current?.permissions ?? null)),
    role,
    isAdmin: role === "org:admin",
  };
  return <PermissionsContext.Provider value={value}>
    {failure === scope && scope && <div className="permissions-notice">
      <NoticeBanner notice={{ kind: "error", message: "No se pudieron actualizar los permisos. Podés usar las acciones de tu rol; si sos encargado, reintentá para cargar tu acceso local." }} onClose={() => setFailure(null)} />
      <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>Reintentar permisos</button>
    </div>}
    {children}
  </PermissionsContext.Provider>;
}
