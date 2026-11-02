from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.session import get_db
from app.deps import get_current_user
from app.schemas.insights import AnalyticsOut, RevisionRequest, WeakTopicOut
from app.schemas.plan import StudySessionOut
from app.services import analytics_service, insights_service
from app.services.activity import log_activity
from app.services.sessions_service import session_out

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/weak-topics", response_model=list[WeakTopicOut])
def weak_topics(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return insights_service.weak_topics(db, current_user.id)


@router.post("/revision", response_model=StudySessionOut)
def add_revision(
    payload: RevisionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = insights_service.schedule_revision(db, current_user.id, payload.subject_name, payload.topic)
    log_activity(
        db, current_user.id, "plan.revision", f"{session.topic} on {session.scheduled_date} {session.start_time}"
    )
    return session_out(session)


@router.get("/analytics", response_model=AnalyticsOut)
def analytics(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return analytics_service.summary(db, current_user.id)
