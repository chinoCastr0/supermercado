/**
 * Navegación y estructura persistente que envuelve el contenido mediante children.
 * La marca y el tema son consistentes entre escritorio y navegación móvil.
 * La navegación entre secciones es local (sin router): el padre controla `view`.
 * OrganizationSwitcher cambia la organización activa; AuthGate remonta la app.
 */
import { Icon } from "./Icon";
import { ThemeToggle } from "./ThemeToggle";
import type { ReactNode } from "react";
import { OrganizationSwitcher, UserButton } from "@clerk/react";
import { usePermissions } from "../hooks/usePermissions";

export type AppView = "productos" | "faltantes" | "equipo" | "caja";

type Props = {
  children: ReactNode;
  view: AppView;
  onNavigate: (view: AppView) => void;
  onImport: () => void;
  onRefresh: () => void;
};

/** Compone navegación, cabecera y contenido de la pantalla. */
export function Layout({
  children,
  view,
  onNavigate,
  onImport,
  onRefresh,
}: Props) {
  const { canManageProducts, canReadProducts, isAdmin } = usePermissions();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Icon name="box" /></span>
          <span>Supermercado</span>
        </div>
        <p className="nav-caption">Espacio de trabajo</p>
        <nav aria-label="Navegación principal">
          {canReadProducts && <button
            className={`nav-item ${view === "caja" ? "active" : ""}`}
            type="button" aria-current={view === "caja" ? "page" : undefined}
            onClick={() => onNavigate("caja")}
          ><span><Icon name="scan" /></span> Caja</button>}
          <button
            className={`nav-item ${view === "productos" ? "active" : ""}`}
            type="button"
            aria-current={view === "productos" ? "page" : undefined}
            onClick={() => onNavigate("productos")}
          >
            <span><Icon name="box" /></span> Productos
          </button>
          <button
            className={`nav-item ${view === "faltantes" ? "active" : ""}`}
            type="button"
            aria-current={view === "faltantes" ? "page" : undefined}
            onClick={() => onNavigate("faltantes")}
          >
            <span><Icon name="list" /></span> Faltantes
          </button>
          {isAdmin && (
            <button
              className={`nav-item ${view === "equipo" ? "active" : ""}`}
              type="button"
              aria-current={view === "equipo" ? "page" : undefined}
              onClick={() => onNavigate("equipo")}
            >
              <span><Icon name="users" /></span> Equipo
            </button>
          )}
        </nav>
          {canManageProducts && (
            <div className="sidebar-tools">
            <button className="nav-item" type="button" onClick={onImport}>
              <span><Icon name="upload" /></span> Importar datos
            </button>
            </div>
          )}
        <div className="sidebar-foot">
          Inventario y gestión diaria
        </div>
      </aside>
      <main className="main-content" id="productos">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark"><Icon name="box" /></span>
            <span>Supermercado</span>
          </div>
          <div className="topbar-title">
            {view === "caja" ? "Caja" : view === "faltantes"
              ? "Faltantes"
              : view === "equipo"
                ? "Equipo"
                : "Productos"}
          </div>
          <div className="topbar-actions">
            <ThemeToggle />
            {view === "productos" && (
            <button
              className="icon-button"
              type="button"
              aria-label="Actualizar"
              onClick={onRefresh}
            >
              <Icon name="refresh" />
            </button>
            )}
            <UserButton />
          </div>
          <div className="topbar-workspace">
            {/* Invitar, cambiar roles y quitar miembros aparecen dentro del
                perfil de la organización sólo con org:sys_memberships:manage
                (admin); el resto ve la lista de miembros en modo lectura. */}
            <OrganizationSwitcher hidePersonal appearance={{ elements: {
              rootBox: { width: "100%", minWidth: 0 },
              organizationSwitcherTrigger: { width: "100%", maxWidth: "100%", minWidth: 0, minHeight: "44px" },
              organizationPreview: { minWidth: 0, flex: 1 },
              organizationPreviewTextContainer: { minWidth: 0, flex: 1 },
              organizationPreviewMainIdentifier: { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
            } }} />
          </div>
        </header>
        <div id="contenido" tabIndex={-1}>{children}</div>
      </main>
    </div>
  );
}
