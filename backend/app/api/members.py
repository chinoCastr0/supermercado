"""Equipo de la organización y permisos efectivos del usuario.

Clerk es la fuente de membresía: invitar, quitar miembros y nombrar admins se
hace en Clerk (<OrganizationProfile>). Acá sólo se asigna el rol local
"encargado" a un org:member, porque el plan de Clerk de producción no admite
roles personalizados. /me/permissions expone los permisos efectivos (Clerk +
rol local) porque el frontend no puede leer el rol local desde el token."""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Literal, Protocol

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app import permissions as perms
from app.auth import AuthContext, _clerk, get_auth_context, require_admin
from app.database import get_db
from app.models.member_role import MemberRole

router = APIRouter(tags=["Members"])
CLERK_PAGE_SIZE = 100


@dataclass(frozen=True)
class ClerkMember:
    """Datos públicos de una membresía de Clerk."""

    user_id: str
    clerk_role: str
    identifier: str | None
    first_name: str | None
    last_name: str | None


class MembershipDirectory(Protocol):
    """Fuente de miembros de una organización (Clerk en producción)."""

    def list_members(self, organization_id: str) -> list[ClerkMember]: ...


class ClerkMembershipDirectory:
    """Lista todas las membresías de la organización vía Backend API de Clerk."""

    def list_members(self, organization_id: str) -> list[ClerkMember]:
        members: list[ClerkMember] = []
        offset = 0
        while True:
            page = _clerk.organization_memberships.list(
                organization_id=organization_id, limit=CLERK_PAGE_SIZE, offset=offset
            )
            for membership in page.data:
                user = membership.public_user_data
                if user is None:
                    continue
                members.append(ClerkMember(
                    user_id=user.user_id,
                    clerk_role=membership.role,
                    identifier=user.identifier or None,
                    first_name=user.first_name,
                    last_name=user.last_name,
                ))
            offset += len(page.data)
            if not page.data or offset >= page.total_count:
                return members


def get_membership_directory() -> MembershipDirectory:
    """Dependency reemplazable en tests."""
    return ClerkMembershipDirectory()


class MemberResponse(BaseModel):
    user_id: str
    name: str
    identifier: str | None
    clerk_role: str
    role: str
    is_self: bool


class MemberRoleUpdate(BaseModel):
    role: Literal["org:member", "org:encargado"]


class MyPermissionsResponse(BaseModel):
    user_id: str
    organization_id: str
    role: str
    permissions: list[str]


def _members_or_502(directory: MembershipDirectory, organization_id: str) -> list[ClerkMember]:
    try:
        return directory.list_members(organization_id)
    except Exception as error:  # Red o Clerk caído: no inventar una lista vacía.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No se pudo consultar los miembros en Clerk. Probá de nuevo.",
        ) from error


def _response(member: ClerkMember, local_role: str | None, ctx: AuthContext) -> MemberResponse:
    effective = member.clerk_role
    if member.clerk_role == perms.MEMBER_ROLE and local_role == perms.ENCARGADO_ROLE:
        effective = perms.ENCARGADO_ROLE
    name = " ".join(part for part in (member.first_name, member.last_name) if part)
    return MemberResponse(
        user_id=member.user_id,
        name=name or member.identifier or member.user_id,
        identifier=member.identifier,
        clerk_role=member.clerk_role,
        role=effective,
        is_self=member.user_id == ctx.user_id,
    )


def _local_roles(db: Session, organization_id: str) -> dict[str, str]:
    rows = db.scalars(select(MemberRole).where(MemberRole.organization_id == organization_id))
    return {row.user_id: row.role for row in rows}


def _forget_former_members(db: Session, organization_id: str, current: Iterable[str]) -> None:
    """Borra roles locales de quienes ya no son miembros en Clerk.

    Así, si alguien vuelve a ser invitado, entra como miembro común."""
    db.execute(
        delete(MemberRole).where(
            MemberRole.organization_id == organization_id,
            MemberRole.user_id.not_in(list(current)),
        )
    )
    db.commit()


@router.get("/me/permissions", response_model=MyPermissionsResponse)
def my_permissions(ctx: AuthContext = Depends(get_auth_context)) -> MyPermissionsResponse:
    """Rol y permisos efectivos del usuario en la organización activa."""
    return MyPermissionsResponse(
        user_id=ctx.user_id,
        organization_id=ctx.org_id,
        role=ctx.org_role,
        permissions=sorted(ctx.effective_permissions),
    )


@router.get("/members", response_model=list[MemberResponse])
def list_members(
    db: Session = Depends(get_db),
    ctx: AuthContext = Depends(require_admin),
    directory: MembershipDirectory = Depends(get_membership_directory),
) -> list[MemberResponse]:
    """Miembros de Clerk con su rol efectivo; sólo para administradores."""
    members = _members_or_502(directory, ctx.org_id)
    _forget_former_members(db, ctx.org_id, (member.user_id for member in members))
    local = _local_roles(db, ctx.org_id)
    return [_response(member, local.get(member.user_id), ctx) for member in members]


@router.put("/members/{user_id}/role", response_model=MemberResponse)
def update_member_role(
    user_id: str,
    payload: MemberRoleUpdate,
    db: Session = Depends(get_db),
    ctx: AuthContext = Depends(require_admin),
    directory: MembershipDirectory = Depends(get_membership_directory),
) -> MemberResponse:
    """Asigna miembro o encargado a un org:member de Clerk de esta organización."""
    member = next(
        (m for m in _members_or_502(directory, ctx.org_id) if m.user_id == user_id),
        None,
    )
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ese usuario no es miembro de la organización.",
        )
    if member.clerk_role != perms.MEMBER_ROLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Los administradores se gestionan desde la configuración de la organización.",
        )
    current = db.get(MemberRole, (ctx.org_id, user_id))
    if payload.role == perms.ENCARGADO_ROLE:
        if current is None:
            db.add(MemberRole(organization_id=ctx.org_id, user_id=user_id,
                              role=payload.role, updated_by=ctx.user_id))
        else:
            current.role = payload.role
            current.updated_by = ctx.user_id
    elif current is not None:
        db.delete(current)
    db.commit()
    return _response(member, payload.role, ctx)
