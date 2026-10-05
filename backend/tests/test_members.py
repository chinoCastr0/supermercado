"""Rol local "encargado" y gestión del equipo (app.api.members).

Clerk se reemplaza por un directorio en memoria: los tests no usan red. El
contexto de auth pasa por apply_local_role igual que en producción, sólo se
reemplaza la verificación del token."""

from decimal import Decimal

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models
from app import permissions
from app.api.members import ClerkMember, get_membership_directory, router as members_router
from app.api.products import router as products_router
from app.auth import AuthContext, apply_local_role, get_auth_context
from app.database import Base, get_db
from app.models.member_role import MemberRole
from app.models.product import Product
from org_context import ADMIN_A, ADMIN_B, MEMBER_A, ORG_A, ORG_B, ctx_for

MEMBER_ID = MEMBER_A.user_id


class FakeDirectory:
    def __init__(self, members: dict[str, list[ClerkMember]], fail: bool = False):
        self.members = members
        self.fail = fail

    def list_members(self, organization_id: str) -> list[ClerkMember]:
        if self.fail:
            raise RuntimeError("Clerk caído")
        return list(self.members.get(organization_id, []))


def _member(user_id: str, role: str, email: str) -> ClerkMember:
    return ClerkMember(user_id=user_id, clerk_role=role, identifier=email,
                       first_name=None, last_name=None)


DIRECTORY = {
    ORG_A: [_member(ADMIN_A.user_id, "org:admin", "admin@a.test"),
            _member(MEMBER_ID, "org:member", "empleado@a.test")],
    ORG_B: [_member(ADMIN_B.user_id, "org:admin", "admin@b.test")],
}


@pytest.fixture
def engine():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(Product(organization_id=ORG_A, barcode="779", name="Leche",
                       price=Decimal("1000")))
        db.commit()
    return engine


def _client(engine, token_ctx: AuthContext, directory=None) -> TestClient:
    """Cliente cuyo token "verificado" es token_ctx; el rol local se aplica de verdad."""
    api = FastAPI()
    api.include_router(members_router, dependencies=[Depends(get_auth_context)])
    api.include_router(products_router, dependencies=[Depends(get_auth_context)])
    factory = sessionmaker(bind=engine)

    def override_db():
        with factory() as session:
            yield session

    api.dependency_overrides[get_db] = override_db
    api.dependency_overrides[get_auth_context] = (
        lambda db=Depends(get_db): apply_local_role(token_ctx, db)
    )
    api.dependency_overrides[get_membership_directory] = (
        lambda: directory or FakeDirectory(DIRECTORY)
    )
    return TestClient(api)


def _promote(engine, org_id: str = ORG_A, user_id: str = MEMBER_ID) -> None:
    with Session(engine) as db:
        db.add(MemberRole(organization_id=org_id, user_id=user_id,
                          role=permissions.ENCARGADO_ROLE, updated_by=ADMIN_A.user_id))
        db.commit()


def test_local_role_adds_encargado_permissions_only_to_members(engine):
    _promote(engine)
    with Session(engine) as db:
        promoted = apply_local_role(MEMBER_A, db)
        assert promoted.org_role == "org:encargado"
        assert promoted.permissions == MEMBER_A.permissions | permissions.ENCARGADO_EXTRA
        assert permissions.ENCARGADO_EXTRA.isdisjoint({"org:sys_memberships:manage"})
        # Un admin no cambia, y la fila no vale en otra organización.
        assert apply_local_role(ADMIN_A, db) is ADMIN_A
        same_user_other_org = ctx_for(ORG_B, MEMBER_A.permissions, user_id=MEMBER_ID,
                                      role="org:member")
        assert apply_local_role(same_user_other_org, db) is same_user_other_org


def test_member_without_local_role_stays_member(engine):
    with Session(engine) as db:
        assert apply_local_role(MEMBER_A, db) is MEMBER_A


def test_admin_promotes_member_and_encargado_can_edit_prices(engine):
    with Session(engine) as db:
        product = db.scalar(select(Product))
        product_id, revision = product.id, product.revision
    price = {"expected_revision": revision, "price": "1500"}

    with _client(engine, MEMBER_A) as member:
        assert member.put(f"/products/{product_id}", json=price).status_code == 403
        assert member.get("/me/permissions").json()["role"] == "org:member"

    with _client(engine, ADMIN_A) as admin:
        response = admin.put(f"/members/{MEMBER_ID}/role", json={"role": "org:encargado"})
        assert response.status_code == 200
        assert response.json()["role"] == "org:encargado"

    with _client(engine, MEMBER_A) as member:
        me = member.get("/me/permissions").json()
        assert me["role"] == "org:encargado"
        assert set(me["permissions"]) == MEMBER_A.permissions | permissions.ENCARGADO_EXTRA
        assert member.put(f"/products/{product_id}", json=price).status_code == 200
        # Encargado no gestiona el equipo.
        assert member.get("/members").status_code == 403
        assert member.put(f"/members/{MEMBER_ID}/role",
                          json={"role": "org:encargado"}).status_code == 403

    with _client(engine, ADMIN_A) as admin:
        assert admin.put(f"/members/{MEMBER_ID}/role",
                         json={"role": "org:member"}).status_code == 200
    with Session(engine) as db:
        assert db.scalars(select(MemberRole)).all() == []


def test_list_members_shows_effective_roles_and_marks_self(engine):
    _promote(engine)
    with _client(engine, ADMIN_A) as admin:
        members = admin.get("/members").json()
    assert [(m["identifier"], m["clerk_role"], m["role"], m["is_self"]) for m in members] == [
        ("admin@a.test", "org:admin", "org:admin", True),
        ("empleado@a.test", "org:member", "org:encargado", False),
    ]


def test_listing_forgets_roles_of_former_members(engine):
    _promote(engine, user_id="user_que_se_fue")
    _promote(engine)
    with _client(engine, ADMIN_A) as admin:
        assert admin.get("/members").status_code == 200
    with Session(engine) as db:
        assert [r.user_id for r in db.scalars(select(MemberRole))] == [MEMBER_ID]


def test_cannot_assign_role_to_admin_or_outsider(engine):
    with _client(engine, ADMIN_A) as admin:
        assert admin.put(f"/members/{ADMIN_A.user_id}/role",
                         json={"role": "org:encargado"}).status_code == 409
        assert admin.put("/members/user_desconocido/role",
                         json={"role": "org:encargado"}).status_code == 404
        assert admin.put(f"/members/{MEMBER_ID}/role",
                         json={"role": "org:admin"}).status_code == 422


def test_other_organization_admin_cannot_touch_members_of_a(engine):
    with _client(engine, ADMIN_B) as admin_b:
        assert admin_b.put(f"/members/{MEMBER_ID}/role",
                           json={"role": "org:encargado"}).status_code == 404
        assert [m["identifier"] for m in admin_b.get("/members").json()] == ["admin@b.test"]
    with Session(engine) as db:
        assert db.scalars(select(MemberRole)).all() == []


def test_clerk_failure_returns_502_without_touching_roles(engine):
    _promote(engine)
    with _client(engine, ADMIN_A, FakeDirectory(DIRECTORY, fail=True)) as admin:
        assert admin.get("/members").status_code == 502
    with Session(engine) as db:
        assert len(db.scalars(select(MemberRole)).all()) == 1
