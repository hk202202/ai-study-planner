from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.db.models import SessionStatus, StudyPlan, StudySession, Subject, User
from app.db.session import get_db
from app.deps import get_current_user
from app.schemas.plan import PlanGenerateRequest, ProgressOut, ProgressSubject, StudyPlanOut
from app.services.activity import log_activity
from app.services.insights_service import weak_topics
from app.services.planner_service import create_plan
from app.services.sessions_service import sessions_out

router = APIRouter(prefix="/plans", tags=["plans"])


def _plan_out(db: Session, plan: StudyPlan) -> StudyPlanOut:
    sessions = sessions_out(db, plan.sessions)
    return StudyPlanOut(
        id=plan.id,
        user_id=plan.user_id,
        hours_per_day=plan.hours_per_day,
        available_days=plan.available_days,
        start_date=plan.start_date,
        created_at=plan.created_at,
        sessions=sessions,
    )


@router.get("/latest", response_model=StudyPlanOut | None)
def latest_plan(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    plan = (
        db.query(StudyPlan)
        .options(joinedload(StudyPlan.sessions).joinedload(StudySession.subject))
        .filter(StudyPlan.user_id == current_user.id)
        .order_by(StudyPlan.created_at.desc())
        .first()
    )
    return _plan_out(db, plan) if plan else None


@router.post("/generate", response_model=StudyPlanOut)
def generate_plan(
    payload: PlanGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = payload.start_date or date.today()
    plan = create_plan(
        db=db,
        user_id=current_user.id,
        hours_per_day=payload.hours_per_day,
        available_days=payload.available_days,
        start_date=start,
        weak_topics=[
            {"subject": w.subject_name, "topic": w.topic, "average_percent": w.average_percent}
            for w in weak_topics(db, current_user.id)
        ],
    )
    log_activity(db, current_user.id, "plan.generate", f"{len(plan.sessions)} sessions from {start}")
    plan = (
        db.query(StudyPlan)
        .options(joinedload(StudyPlan.sessions).joinedload(StudySession.subject))
        .filter(StudyPlan.id == plan.id)
        .first()
    )
    return _plan_out(db, plan)


@router.get("/progress", response_model=ProgressOut)
def progress(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    subjects = db.query(Subject).filter(Subject.user_id == current_user.id).all()
    subject_stats: list[ProgressSubject] = []
    total = 0
    completed = 0

    for subject in subjects:
        sessions = db.query(StudySession).filter(StudySession.subject_id == subject.id).all()
        sub_total = len(sessions)
        sub_done = sum(1 for s in sessions if s.status == SessionStatus.done)
        total += sub_total
        completed += sub_done
        pct = (sub_done / sub_total * 100) if sub_total else 0.0
        subject_stats.append(
            ProgressSubject(
                subject_id=subject.id,
                subject_name=subject.name,
                total_sessions=sub_total,
                completed_sessions=sub_done,
                completion_percent=round(pct, 1),
            )
        )

    streak = _compute_streak(db, current_user.id)
    return ProgressOut(
        subjects=subject_stats,
        current_streak=streak,
        total_sessions=total,
        completed_sessions=completed,
    )


def _compute_streak(db: Session, user_id: int) -> int:
    sessions = (
        db.query(StudySession)
        .join(StudyPlan, StudyPlan.id == StudySession.plan_id)
        .filter(StudyPlan.user_id == user_id, StudySession.status == SessionStatus.done)
        .order_by(StudySession.scheduled_date.desc())
        .all()
    )
    done_dates = {s.scheduled_date for s in sessions}
    today = date.today()
    expected = today if today in done_dates else today - timedelta(days=1)
    streak = 0
    while expected in done_dates:
        streak += 1
        expected -= timedelta(days=1)
    return streak
