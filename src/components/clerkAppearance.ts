/** Clerk hereda los tokens de la app, también en sus menús y diálogos. */
export const clerkAppearance = {
  variables: {
    fontFamily: "var(--font-ui)", fontFamilyButtons: "var(--font-ui)",
    colorPrimary: "var(--accent)", colorPrimaryForeground: "var(--on-accent)",
    colorBackground: "var(--surface)", colorForeground: "var(--ink)",
    colorMuted: "var(--surface-subtle)", colorMutedForeground: "var(--muted)",
    colorInput: "var(--surface)", colorInputForeground: "var(--ink)",
    colorBorder: "var(--line)", colorNeutral: "var(--ink)",
    colorDanger: "var(--error)", colorSuccess: "var(--success)", colorWarning: "var(--warning)",
    colorRing: "var(--accent)", colorModalBackdrop: "var(--overlay)",
    borderRadius: "var(--radius-md)",
  },
  elements: {
    card: { boxShadow: "var(--shadow-sm)", border: "1px solid var(--line)" },
    organizationSwitcherTrigger: { minHeight: "44px", maxWidth: "200px" },
    userButtonTrigger: { minWidth: "44px", minHeight: "44px" },
  },
};
