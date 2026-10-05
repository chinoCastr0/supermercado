/**
 * Tapa toda la app hasta que haya una sesión de Clerk activa CON organización.
 * No hay rutas públicas: login, elección de organización y app reemplazan el
 * contenido entero, en ese orden.
 *
 * Con "Membership required" una sesión sin organización queda `pending` con la
 * tarea choose-organization; se resuelve acá con TaskChooseOrganization. Si la
 * sesión está activa pero sin organización (p. ej. lo quitaron de la última),
 * se muestra OrganizationList.
 *
 * La app se monta con `key={orgId}`: al cambiar de organización se descarta
 * todo el estado de React (productos, faltantes, selección, modales) y se
 * vuelve a cargar con el token de la nueva organización. Así ningún dato de la
 * organización anterior queda en pantalla.
 */
import { Fragment, type ReactNode } from "react";
import {
  OrganizationList,
  SignIn,
  TaskChooseOrganization,
  useAuth,
  useClerk,
} from "@clerk/react";

type Props = { children: ReactNode };

export function AuthGate({ children }: Props) {
  // treatPendingAsSignedOut: false hace que este hook también se actualice
  // mientras la sesión espera la tarea de elegir organización.
  const { isLoaded, isSignedIn, orgId } = useAuth({
    treatPendingAsSignedOut: false,
  });
  const clerk = useClerk();

  if (!isLoaded) return null;

  if (clerk.session?.currentTask?.key === "choose-organization") {
    return (
      <div className="auth-gate">
        <TaskChooseOrganization redirectUrlComplete="/" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="auth-gate">
        <SignIn />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="auth-gate">
        <OrganizationList hidePersonal />
      </div>
    );
  }

  return <Fragment key={orgId}>{children}</Fragment>;
}
