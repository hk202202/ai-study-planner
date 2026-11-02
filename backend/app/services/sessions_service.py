from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.db.models import FocusLog, StudySession
from app.schemas.plan import StudySessionOut


def get_user_session(db: Session, session_id: int, user_id: int) -> StudySession:
    session = (
        db.query(StudySession)
        .options(joinedload(StudySession.subject), joinedload(StudySession.plan))
        .filter(StudySession.id == session_id)
        .first()
    )
    if not session or session.plan.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def focused_minutes(db: Session, session_ids: list[int]) -> dict[int, int]:
    if not session_ids:
        return {}
    rows = (
        db.query(FocusLog.session_id, func.sum(FocusLog.minutes))
        .filter(FocusLog.session_id.in_(session_ids))
        .group_by(FocusLog.session_id)
        .all()
    )
    return {session_id: int(total) for session_id, total in rows}


def session_out(session: StudySession, focused: int = 0) -> StudySessionOut:
    return StudySessionOut(
        id=session.id,
        plan_id=session.plan_id,
        subject_id=session.subject_id,
        scheduled_date=session.scheduled_date,
        start_time=session.start_time,
        duration_minutes=session.duration_minutes,
        topic=session.topic,
        goal=session.goal,
        status=session.status,
        subject_name=session.subject.name if session.subject else None,
        focused_minutes=focused,
    )


def sessions_out(db: Session, sessions: list[StudySession]) -> list[StudySessionOut]:
    focused = focused_minutes(db, [s.id for s in sessions])
    return [session_out(s, focused.get(s.id, 0)) for s in sessions]
