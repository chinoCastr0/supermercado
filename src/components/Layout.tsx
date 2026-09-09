/**
 * Navegación y estructura persistente que envuelve el contenido mediante children.
 * El texto de conexión es estático: no refleja el estado real de PostgreSQL.
 */
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  onImport: () => void;
  onRefresh: () => void;
};

/** Compone navegación, cabecera y contenido de la pantalla. */
export function Layout({ children, onImport, onRefresh }: Props) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"></span>
          <span>Gestión del negocio</span>
        </div>
        <nav aria-label="Navegación principal">
          <a className="nav-item active" href="#productos">
            <span>◦</span> Productos
          </a>
          <button className="nav-item" type="button" onClick={onImport}>
            <span>⇧</span> Importar datos
          </button>
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
            <span className="eyebrow-line" /> INVENTARIO GENERAL
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Actualizar productos"
            onClick={onRefresh}
          >
            ↻
          </button>
        </header>
        {children}
      </main>
    </div>
  );
}
