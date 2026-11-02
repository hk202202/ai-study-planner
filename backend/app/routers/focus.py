from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.timeutils import utc_now_naive
from app.db.models import FocusLog, SessionStatus, User
from app.db.session import get_db
from app.deps import get_current_user
from app.schemas.insights import FocusLogRequest, FocusResult
from app.services.activity import log_activity
from app.services.sessions_service import focused_minutes, get_user_session, session_out

router = APIRouter(prefix="/focus", tags=["focus"])


@router.post("", response_model=FocusResult)
def log_focus(
    payload: FocusLogRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_user_session(db, payload.session_id, current_user.id) if payload.session_id else None
    db.add(
        FocusLog(
            user_id=current_user.id,
            session_id=session.id if session else None,
            subject_name=session.subject.name if session and session.subject else "",
            topic=session.topic if session else "",
            minutes=payload.minutes,
            ended_at=utc_now_naive(),
        )
    )
    if session and payload.mark_done:
        session.status = SessionStatus.done
    db.commit()

    label = f"{session.topic}: " if session else ""
    log_activity(
        db,
        current_user.id,
        "focus.log",
        f"{label}{payload.minutes} min" + (", marked done" if session and payload.mark_done else ""),
    )
    if not session:
        return FocusResult(minutes_logged=payload.minutes)
    db.refresh(session)
    return FocusResult(
        minutes_logged=payload.minutes,
        session=session_out(session, focused_minutes(db, [session.id]).get(session.id, 0)),
    )
