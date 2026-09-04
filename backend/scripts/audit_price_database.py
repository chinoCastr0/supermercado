"""Read-only audit of database objects that could transform product prices."""

from sqlalchemy import inspect, text

from app.database import engine


inspector = inspect(engine)
price_column = next(
    column
    for column in inspector.get_columns("products")
    if column["name"] == "price"
)
print(
    "price_column="
    f"{price_column['type']} nullable={price_column['nullable']} "
    f"default={price_column['default']}"
)
print(f"tables={','.join(sorted(inspector.get_table_names()))}")
print(f"views={','.join(sorted(inspector.get_view_names())) or 'none'}")

if engine.dialect.name == "postgresql":
    with engine.connect() as connection:
        triggers = connection.execute(
            text(
                "SELECT trigger_name, event_manipulation, action_timing "
                "FROM information_schema.triggers "
                "WHERE event_object_schema = :schema "
                "AND event_object_table = :table "
                "ORDER BY trigger_name, event_manipulation"
            ),
            {"schema": "public", "table": "products"},
        ).all()
        rules = connection.execute(
            text(
                "SELECT rulename FROM pg_rules "
                "WHERE schemaname = :schema AND tablename = :table "
                "ORDER BY rulename"
            ),
            {"schema": "public", "table": "products"},
        ).scalars().all()
    print(f"product_triggers={triggers or 'none'}")
    print(f"product_rules={list(rules) or 'none'}")
