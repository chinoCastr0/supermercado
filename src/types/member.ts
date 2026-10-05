/** Contratos de /members y /me/permissions; sincronizar con app/api/members.py. */

export type AssignableRole = "org:member" | "org:encargado";

export type Member = {
  user_id: string;
  name: string;
  identifier: string | null;
  /** Rol en Clerk: org:admin u org:member. */
  clerk_role: string;
  /** Rol efectivo: el de Clerk, o org:encargado si hay rol local. */
  role: string;
  is_self: boolean;
};

export type MyPermissions = {
  user_id: string;
  organization_id: string;
  role: string;
  permissions: string[];
};
