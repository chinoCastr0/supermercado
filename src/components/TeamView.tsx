/**
 * Sección "Equipo" (sólo admin): miembros de la organización y rol local.
 * Invitar, quitar miembros y nombrar administradores se hace en "Gestionar"
 * del selector de organización (Clerk). Acá sólo se elige Empleado/Encargado.
 * El cambio rige en el backend de inmediato; la interfaz del empleado se
 * actualiza cuando recarga la app.
 */
import { Icon } from "./Icon";
import { OrganizationSwitcher } from "@clerk/react";
import { Skeleton } from "./Skeleton";
import { useEffect, useState } from "react";
import { membersApi } from "../api/members";
import type { AssignableRole, Member } from "../types/member";
import type { Notice } from "../types/product";
import { canAssignLocalRole, roleLabel } from "../utils/permissions";
import { NoticeBanner } from "./NoticeBanner";

export function TeamView() {
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let active = true;
    membersApi
      .list()
      .then((loaded) => {
        if (active) setMembers(loaded);
      })
      .catch((error: unknown) => {
        if (active)
          setNotice({
            kind: "error",
            message:
              error instanceof Error ? error.message : "No se pudo cargar el equipo.",
          });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const changeRole = async (member: Member, role: AssignableRole) => {
    setSavingId(member.user_id);
    try {
      const updated = await membersApi.setRole(member.user_id, role);
      setMembers((current) =>
        current.map((item) => (item.user_id === updated.user_id ? updated : item)),
      );
      setNotice({
        kind: "success",
        message: `${updated.name} ahora es ${roleLabel(updated.role)}.`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "No se pudo cambiar el rol.",
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="content">
      <div className="page-heading">
        <div>
          <h1>Equipo</h1>
          <p>
            Elegí qué puede hacer cada empleado. Para invitar o quitar miembros
            usá «Gestionar» en el selector de organización.
          </p>
        </div>
      </div>
      {notice && <NoticeBanner notice={notice} onClose={() => setNotice(null)} />}
      <section className="data-card" aria-labelledby="team-title">
        <div className="table-toolbar">
          <div>
            <h2 id="team-title">Miembros</h2>
            <p>
              Encargado: además de lo del empleado, gestiona productos, cambia
              precios y exporta a la caja.
            </p>
          </div>
        </div>
        {isLoading ? (
          <Skeleton label="Cargando equipo" />
        ) : !members.length ? (
          <div className="state-panel">
            <div className="empty-icon"><Icon name="users" /></div>
            <h3>No hay miembros para mostrar</h3>
            <p>Administrá tu equipo desde el selector de organización.</p>
            <OrganizationSwitcher hidePersonal />
          </div>
        ) : (
          <div className="table-wrap team-table">
            <table>
              <thead>
                <tr>
                  <th>Miembro</th>
                  <th>Correo</th>
                  <th>Rol</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.user_id}>
                    <td data-label="Miembro">
                      <strong>{member.name}</strong>
                      {member.is_self && <small> (vos)</small>}
                    </td>
                    <td data-label="Correo">{member.identifier ?? "—"}</td>
                    <td data-label="Rol">
                      {canAssignLocalRole(member) ? (
                        <select
                          aria-label={`Rol de ${member.name}`}
                          value={member.role}
                          disabled={savingId !== null}
                          onChange={(event) =>
                            void changeRole(member, event.target.value as AssignableRole)
                          }
                        >
                          <option value="org:member">{roleLabel("org:member")}</option>
                          <option value="org:encargado">{roleLabel("org:encargado")}</option>
                        </select>
                      ) : (
                        <span>{roleLabel(member.role)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
