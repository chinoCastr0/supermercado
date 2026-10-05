/**
 * Navegación y estructura persistente que envuelve el contenido mediante children.
 * El texto de conexión es estático: no refleja el estado real de PostgreSQL.
 * La navegación entre secciones es local (sin router): el padre controla `view`.
 * OrganizationSwitcher cambia la organización activa; AuthGate remonta la app.
 */
import type { ReactNode } from "react";
import { OrganizationSwitcher, UserButton } from "@clerk/react";
import { usePermissions } from "../hooks/usePermissions";

export type AppView = "productos" | "faltantes";

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
  const { canManageProducts } = usePermissions();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"></span>
          <span>Gestión del negocio</span>
        </div>
        <nav aria-label="Navegación principal">
          <button
            className={`nav-item ${view === "productos" ? "active" : ""}`}
            type="button"
            aria-current={view === "productos" ? "page" : undefined}
            onClick={() => onNavigate("productos")}
          >
            <span>◦</span> Productos
          </button>
          <button
            className={`nav-item ${view === "faltantes" ? "active" : ""}`}
            type="button"
            aria-current={view === "faltantes" ? "page" : undefined}
            onClick={() => onNavigate("faltantes")}
          >
            <span>▤</span> Faltantes
          </button>
          {canManageProducts && (
            <button className="nav-item" type="button" onClick={onImport}>
              <span>⇧</span> Importar datos
            </button>
          )}
        </nav>
        <div className="sidebar-foot">
          <span className="connection-dot" /> Base de datos conectada
        </div>
      </aside>
      <main className="main-content" id="productos">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark">S</span>
            <span>Supermercado</span>
          </div>
          <div className="eyebrow">
            <span className="eyebrow-line" />{" "}
            {view === "faltantes" ? "LISTA DE FALTANTES" : "INVENTARIO GENERAL"}
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              type="button"
              aria-label="Actualizar"
              onClick={onRefresh}
            >
              ↻
            </button>
            {/* Invitar, cambiar roles y quitar miembros aparecen dentro del
                perfil de la organización sólo con org:sys_memberships:manage
                (admin); el resto ve la lista de miembros en modo lectura. */}
            <OrganizationSwitcher hidePersonal />
            <UserButton />
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
