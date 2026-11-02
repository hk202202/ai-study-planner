from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _add_missing_columns() -> None:
    """There are no migrations, so new columns are added to existing tables here. They must be nullable or have a scalar default."""
    inspector = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue
        existing = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing:
                continue
            ddl = f"ALTER TABLE {table.name} ADD COLUMN {column.name} {column.type.compile(dialect=engine.dialect)}"
            if column.default is not None and column.default.is_scalar:
                value = column.default.arg
                ddl += f" DEFAULT {int(value) if isinstance(value, bool) else repr(value)}"
            with engine.begin() as conn:
                conn.execute(text(ddl))


def init_db() -> None:
    from app.db import models  # noqa: F401

    _add_missing_columns()
    Base.metadata.create_all(bind=engine)
