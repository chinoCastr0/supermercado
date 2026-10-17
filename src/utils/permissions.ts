/**
 * Permisos personalizados de Clerk y su traducción a capacidades de la UI.
 * Lógica pura (sin React ni Clerk) para poder probarla con node --test.
 * La UI sólo oculta o deshabilita: el backend vuelve a exigir cada permiso y
 * responde 403 si falta, así que estas reglas deben coincidir con app/permissions.py.
 */

export const PERMISSIONS = {
  salesCreate: "org:sales:create",
  salesRead: "org:sales:read",
  closuresManage: "org:closures:manage",
  productsRead: "org:products:read",
  productsManage: "org:products:manage",
  pricesEdit: "org:prices:edit",
  labelsPrint: "org:labels:print",
  missingManage: "org:missing:manage",
  exportRegister: "org:export:register",
} as const;

export type Capabilities = {
  canCreateSales: boolean;
  canReadSales: boolean;
  canManageClosures: boolean;
  canReadProducts: boolean;
  canManageProducts: boolean;
  canEditPrices: boolean;
  canPrintLabels: boolean;
  canManageMissing: boolean;
  canExportRegister: boolean;
};

/** Sin sesión u organización cargada: nada habilitado. */
export const NO_CAPABILITIES: Capabilities = {
  canCreateSales: false, canReadSales: false, canManageClosures: false,
  canReadProducts: false,
  canManageProducts: false,
  canEditPrices: false,
  canPrintLabels: false,
  canManageMissing: false,
  canExportRegister: false,
};

/** Traduce el `has` de Clerk (u otro chequeo equivalente) a capacidades. */
export function capabilitiesFrom(
  has: (permission: string) => boolean,
): Capabilities {
  return {
    canCreateSales: has(PERMISSIONS.salesCreate),
    canReadSales: has(PERMISSIONS.salesRead),
    canManageClosures: has(PERMISSIONS.closuresManage),
    canReadProducts: has(PERMISSIONS.productsRead),
    canManageProducts: has(PERMISSIONS.productsManage),
    canEditPrices: has(PERMISSIONS.pricesEdit),
    canPrintLabels: has(PERMISSIONS.labelsPrint),
    canManageMissing: has(PERMISSIONS.missingManage),
    canExportRegister: has(PERMISSIONS.exportRegister),
  };
}

export type ProductFormAccess = {
  /** Código, nombre, peso y unidad. */
  canEditDetails: boolean;
  canEditPrice: boolean;
  canSubmit: boolean;
  canCreateOffer: boolean;
};

/**
 * Qué puede hacer el usuario en el formulario de producto. En un alta el
 * precio inicial no es un "cambio de precio": alcanza con gestionar productos,
 * igual que en el backend.
 */
export function productFormAccess(
  capabilities: Capabilities,
  isNew: boolean,
): ProductFormAccess {
  if (isNew) {
    return {
      canEditDetails: capabilities.canManageProducts,
      canEditPrice: capabilities.canManageProducts,
      canSubmit: capabilities.canManageProducts,
      canCreateOffer: false,
    };
  }
  return {
    canEditDetails: capabilities.canManageProducts,
    canEditPrice: capabilities.canEditPrices,
    canSubmit: capabilities.canManageProducts || capabilities.canEditPrices,
    canCreateOffer: capabilities.canPrintLabels,
  };
}

/** Puede abrir el formulario de un producto existente (para editar u ofertar). */
export function canOpenProduct(capabilities: Capabilities): boolean {
  const access = productFormAccess(capabilities, false);
  return access.canSubmit || access.canCreateOffer;
}

/** Mensaje claro para un 403 del backend según su `detail.code`. */
export function forbiddenMessage(data: unknown): string {
  const detail =
    data && typeof data === "object" && "detail" in data ? data.detail : null;
  const code =
    detail && typeof detail === "object" && "code" in detail ? detail.code : null;
  if (code === "organization_required")
    return "Seleccioná o creá una organización para continuar.";
  if (code === "unsupported_token")
    return "Tu sesión está desactualizada. Cerrá sesión y volvé a ingresar.";
  return "Tu rol en esta organización no permite esta acción. Pedile acceso a un administrador.";
}

/** Nombres visibles de los roles (Clerk + rol local "encargado"). */
export const ROLE_LABELS: Record<string, string> = {
  "org:admin": "Administrador",
  "org:encargado": "Encargado",
  "org:member": "Empleado",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

/**
 * El rol local sólo se asigna a miembros comunes de Clerk que no sean el
 * propio usuario; los administradores se gestionan en Clerk.
 */
export function canAssignLocalRole(member: {
  clerk_role: string;
  is_self: boolean;
}): boolean {
  return member.clerk_role === "org:member" && !member.is_self;
}

/** Une los permisos del token de Clerk con los efectivos que informa el backend. */
export function mergedHas(
  tokenHas: (permission: string) => boolean,
  serverPermissions: readonly string[] | null,
): (permission: string) => boolean {
  return (permission) =>
    tokenHas(permission) || Boolean(serverPermissions?.includes(permission));
}
