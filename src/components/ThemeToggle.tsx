/** Preferencia visual local; no participa de la sesión ni del estado de negocio. */
import { useState } from "react";
import { Icon } from "./Icon";

export function ThemeToggle() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "system");
  const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const labels = { system: "sistema", light: "claro", dark: "oscuro" };
  return <button className="icon-button" type="button"
    aria-label={`Tema ${labels[theme as keyof typeof labels]}. Cambiar a ${labels[next]}`}
    title={`Cambiar a tema ${labels[next]}`}
    onClick={() => {
      if (next === "system") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = next;
      try { localStorage.setItem("supermercado-theme", next); } catch { /* La preferencia sigue activa durante esta sesión. */ }
      setTheme(next);
    }}><Icon name={theme === "system" ? "monitor" : theme === "light" ? "sun" : "moon"} /></button>;
}
