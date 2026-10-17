/** Ciclo real del proveedor con hooks controlados: demora, error y cambio de org. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import * as permissions from "../src/utils/permissions.ts";

test("el proveedor descarta respuestas de otra org y permite reintentar un error", async () => {
  const source = await readFile(new URL("../src/components/PermissionsProvider.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  let auth = { userId: "user", orgId: "org_a", orgRole: "org:admin", has: () => false };
  const state = [], effects = [], requests = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useEffect(run, dependencies) {
      const index = cursor++;
      const previous = effects[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        previous?.cleanup?.();
        effects[index] = { dependencies, cleanup: run() };
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@clerk/react": { useAuth: () => auth },
    "../api/members": { membersApi: { myPermissions: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) } },
    "../hooks/usePermissions": { PermissionsContext: { Provider: "provider" } },
    "../utils/permissions": permissions,
    "./NoticeBanner": { NoticeBanner: "notice" },
  };
  const exports = {};
  new Function("require", "exports", compiled)((name) => modules[name], exports);
  const render = () => { cursor = 0; return exports.PermissionsProvider({ children: "app" }); };
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
  const response = (organization_id, role, extra = []) => ({ user_id: "user", organization_id, role, permissions: extra });
  try {
    let view = render();
    assert.equal(view.props.value.canCreateSales, true); // Admin sin esperar HTTP.
    auth = { ...auth, orgId: "org_b", orgRole: "org:member" };
    view = render();
    assert.equal(requests.length, 2);
    requests[0].resolve(response("org_a", "org:admin", Object.values(permissions.PERMISSIONS)));
    await settle();
    view = render();
    assert.equal(view.props.value.canManageClosures, false);
    requests[1].reject(new Error("Sin conexión"));
    await settle();
    view = render();
    assert.equal(view.props.value.canCreateSales, true);
    assert.equal(view.props.value.canReadSales, false);
    const warning = view.props.children[0];
    assert.equal(warning.props.className, "permissions-notice");
    warning.props.children[1].props.onClick();
    render();
    assert.equal(requests.length, 3);
    requests[2].resolve(response("org_b", "org:encargado"));
    await settle();
    view = render();
    assert.equal(view.props.value.canManageClosures, true);
    auth = { ...auth, orgId: "org_c" };
    view = render();
    assert.equal(view.props.value.role, "org:member");
    assert.equal(view.props.value.canManageClosures, false);
  } finally { effects.forEach((effect) => effect?.cleanup?.()); }
});
