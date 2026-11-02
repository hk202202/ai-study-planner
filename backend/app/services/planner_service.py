from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.timeutils import to_utc_naive
from app.db.models import Reminder, SessionStatus, StudyPlan, StudySession, Subject
from app.services import ai_service

DAY_MAP = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}


def next_available_date(start: date, day_offset: int, available_days: list[str]) -> date:
    allowed = {DAY_MAP[d.lower()[:3]] for d in available_days if d.lower()[:3] in DAY_MAP}
    if not allowed:
        allowed = set(range(7))
    current = start
    counted = 0
    while counted < day_offset:
        current += timedelta(days=1)
        if current.weekday() in allowed:
            counted += 1
    while current.weekday() not in allowed:
        current += timedelta(days=1)
    return current


def create_plan(
    db: Session,
    user_id: int,
    hours_per_day: float,
    available_days: list[str],
    start_date: date,
    weak_topics: list[dict] | None = None,
) -> StudyPlan:
    subjects = db.query(Subject).filter(Subject.user_id == user_id).all()
    if not subjects:
        raise HTTPException(status_code=400, detail="Add at least one subject before generating a plan")

    subject_payload = [
        {
            "name": s.name,
            "exam_date": s.exam_date.isoformat() if s.exam_date else None,
            "difficulty": s.difficulty,
            "priority": s.priority,
            "topics": s.topics or [],
        }
        for s in subjects
    ]

    ai_sessions = ai_service.generate_study_plan_payload(
        subjects=subject_payload,
        hours_per_day=hours_per_day,
        available_days=available_days,
        start_date=start_date.isoformat(),
        weak_topics=weak_topics,
    )

    for old_plan in db.query(StudyPlan).filter(StudyPlan.user_id == user_id).all():
        db.delete(old_plan)
    db.flush()

    name_to_subject = {s.name.lower(): s for s in subjects}
    plan = StudyPlan(
        user_id=user_id,
        hours_per_day=hours_per_day,
        available_days=available_days,
        start_date=start_date,
    )
    db.add(plan)
    db.flush()

    for item in ai_sessions:
        subject_name = str(item.get("subject_name", "")).strip()
        subject = name_to_subject.get(subject_name.lower())
        if not subject:
            for s in subjects:
                if s.name.lower() in subject_name.lower() or subject_name.lower() in s.name.lower():
                    subject = s
                    break
        if not subject:
            subject = subjects[0]

        day_offset = int(item.get("day_offset", 0))
        scheduled = next_available_date(start_date, day_offset, available_days)
        duration = int(item.get("duration_minutes", 45))
        session = StudySession(
            plan_id=plan.id,
            subject_id=subject.id,
            scheduled_date=scheduled,
            start_time=str(item.get("start_time", "09:00"))[:5],
            duration_minutes=max(15, min(duration, 180)),
            topic=str(item.get("topic", "General review")),
            goal=str(item.get("goal", "")),
            status=SessionStatus.pending,
        )
        db.add(session)
        db.flush()
        create_session_reminder(db, user_id, session)

    db.commit()
    db.refresh(plan)
    return plan


def session_reminder_due(session: StudySession) -> datetime:
    try:
        hour, minute = (int(x) for x in session.start_time.split(":")[:2])
    except ValueError:
        hour, minute = 9, 0
    local_start = datetime.combine(session.scheduled_date, datetime.min.time()).replace(hour=hour, minute=minute)
    return to_utc_naive(local_start.astimezone()) - timedelta(minutes=15)


def create_session_reminder(db: Session, user_id: int, session: StudySession) -> None:
    reminder = Reminder(
        user_id=user_id,
        session_id=session.id,
        title=f"Upcoming: {session.topic}",
        message=f"Study session starts at {session.start_time}",
        due_at=session_reminder_due(session),
        is_due=False,
        is_read=False,
    )
    db.add(reminder)
