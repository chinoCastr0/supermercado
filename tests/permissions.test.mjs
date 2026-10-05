/**
 * Gating de la UI por permisos de Clerk: qué acciones ve cada rol y qué mensaje
 * se muestra ante un 403 del backend. Lógica pura, sin React ni Clerk.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  NO_CAPABILITIES,
  PERMISSIONS,
  canOpenProduct,
  capabilitiesFrom,
  forbiddenMessage,
  productFormAccess,
} from "../src/utils/permissions.ts";

const roles = {
  admin: Object.values(PERMISSIONS),
  encargado: Object.values(PERMISSIONS),
  member: [
    PERMISSIONS.productsRead,
    PERMISSIONS.labelsPrint,
    PERMISSIONS.missingManage,
  ],
};
const capabilitiesOf = (role) =>
  capabilitiesFrom((permission) => roles[role].includes(permission));

test("los permisos coinciden con los creados en Clerk y en el backend", () => {
  assert.deepEqual(Object.values(PERMISSIONS).sort(), [
    "org:export:register",
    "org:labels:print",
    "org:missing:manage",
    "org:prices:edit",
    "org:products:manage",
    "org:products:read",
  ]);
});

test("el empleado lee, imprime y anota faltantes, pero no cambia precios ni borra", () => {
  assert.deepEqual(capabilitiesOf("member"), {
    canReadProducts: true,
    canManageProducts: false,
    canEditPrices: false,
    canPrintLabels: true,
    canManageMissing: true,
    canExportRegister: false,
  });
});

test("el admin tiene todas las capacidades", () => {
  assert.ok(Object.values(capabilitiesOf("admin")).every(Boolean));
});

test("sin sesión cargada no se habilita nada", () => {
  assert.ok(Object.values(NO_CAPABILITIES).every((value) => value === false));
  assert.equal(canOpenProduct(NO_CAPABILITIES), false);
});

test("el empleado abre un producto sólo para ver y crear oferta", () => {
  const access = productFormAccess(capabilitiesOf("member"), false);
  assert.deepEqual(access, {
    canEditDetails: false,
    canEditPrice: false,
    canSubmit: false,
    canCreateOffer: true,
  });
  assert.equal(canOpenProduct(capabilitiesOf("member")), true);
});

test("el empleado no puede dar de alta productos", () => {
  assert.equal(productFormAccess(capabilitiesOf("member"), true).canSubmit, false);
});

test("con sólo prices:edit se edita el precio pero no los datos", () => {
  const onlyPrices = capabilitiesFrom((p) => p === PERMISSIONS.pricesEdit);
  assert.deepEqual(productFormAccess(onlyPrices, false), {
    canEditDetails: false,
    canEditPrice: true,
    canSubmit: true,
    canCreateOffer: false,
  });
});

test("en el alta el precio inicial depende de gestionar productos, no de prices:edit", () => {
  const catalogOnly = capabilitiesFrom((p) => p === PERMISSIONS.productsManage);
  const access = productFormAccess(catalogOnly, true);
  assert.equal(access.canEditPrice, true);
  assert.equal(access.canSubmit, true);
  assert.equal(productFormAccess(catalogOnly, false).canEditPrice, false);
});

test("el 403 del backend se traduce según su código", () => {
  const denied = { detail: { code: "permission_denied", message: "x" } };
  assert.match(forbiddenMessage(denied), /no permite esta acción/);
  assert.match(
    forbiddenMessage({ detail: { code: "organization_required" } }),
    /organización/,
  );
  assert.match(
    forbiddenMessage({ detail: { code: "unsupported_token" } }),
    /volvé a ingresar/,
  );
  assert.match(forbiddenMessage(null), /no permite esta acción/);
});
