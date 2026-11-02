from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.db.models import StudyPlan, StudySession, User
from app.db.session import get_db
from app.deps import get_current_user
from app.schemas.plan import SessionUpdate, StudySessionOut
from app.services.activity import log_activity
from app.services.planner_service import session_reminder_due
from app.services.sessions_service import get_user_session, sessions_out

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("", response_model=list[StudySessionOut])
def list_sessions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sessions = (
        db.query(StudySession)
        .join(StudyPlan, StudyPlan.id == StudySession.plan_id)
        .options(joinedload(StudySession.subject))
        .filter(StudyPlan.user_id == current_user.id)
        .order_by(StudySession.scheduled_date, StudySession.start_time)
        .all()
    )
    return sessions_out(db, sessions)


@router.patch("/{session_id}", response_model=StudySessionOut)
def update_session(
    session_id: int,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = get_user_session(db, session_id, current_user.id)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(session, key, value)
    if "scheduled_date" in changes or "start_time" in changes:
        for reminder in session.reminders:
            reminder.due_at = session_reminder_due(session)
            reminder.message = f"Study session starts at {session.start_time}"
            reminder.is_due = False
            reminder.is_read = False
    db.commit()
    summary = ", ".join(f"{k}={v.value if hasattr(v, 'value') else v}" for k, v in changes.items())
    log_activity(db, current_user.id, "session.update", f"{session.topic}: {summary}")
    db.refresh(session)
    return sessions_out(db, [session])[0]
