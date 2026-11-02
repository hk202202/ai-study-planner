from contextvars import ContextVar

from sqlalchemy.orm import Session

from app.db.models import ActivityLog

client_ip: ContextVar[str] = ContextVar("client_ip", default="")


def log_activity(db: Session, user_id: int | None, action: str, detail: str = "") -> None:
    db.add(ActivityLog(user_id=user_id, action=action, detail=detail[:1000], ip=client_ip.get()))
    db.commit()
