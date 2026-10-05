/**
 * Adaptador HTTP del equipo: permisos efectivos del usuario y rol local
 * "encargado". Invitar o quitar miembros se hace en Clerk, no acá.
 */
import { request } from "./products";
import type { Member, MyPermissions, AssignableRole } from "../types/member";

export const membersApi = {
  myPermissions: () => request<MyPermissions>("/me/permissions"),
  list: () => request<Member[]>("/members"),
  setRole: (userId: string, role: AssignableRole) =>
    request<Member>(`/members/${encodeURIComponent(userId)}/role`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    }),
};
