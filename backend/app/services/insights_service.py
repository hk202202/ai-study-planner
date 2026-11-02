from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.db.models import Quiz, SessionStatus, StudyPlan, StudySession, Subject
from app.schemas.insights import WeakTopicOut
from app.services.planner_service import create_session_reminder, next_available_date

WEAK_THRESHOLD = 60.0
RECENT_ATTEMPTS = 3
REVISION_MINUTES = 45
REVISION_PREFIX = "Revision: "
LATEST_REVISION_START = 21 * 60


def _quiz_percent(quiz: Quiz) -> float:
    total = len(quiz.questions or [])
    return (quiz.score or 0) / total * 100 if total else 0.0


def _latest_plan(db: Session, user_id: int) -> StudyPlan | None:
    return db.query(StudyPlan).filter(StudyPlan.user_id == user_id).order_by(StudyPlan.created_at.desc()).first()


def _upcoming_revision_topics(db: Session, user_id: int) -> set[str]:
    plan = _latest_plan(db, user_id)
    if not plan:
        return set()
    rows = (
        db.query(StudySession.topic)
        .filter(
            StudySession.plan_id == plan.id,
            StudySession.status == SessionStatus.pending,
            StudySession.scheduled_date >= date.today(),
            StudySession.topic.like(f"{REVISION_PREFIX}%"),
        )
        .all()
    )
    return {topic[len(REVISION_PREFIX) :].strip().lower() for (topic,) in rows}


def weak_topics(db: Session, user_id: int) -> list[WeakTopicOut]:
    """A topic is weak when the average of its last few quiz scores is below the threshold."""
    quizzes = (
        db.query(Quiz)
        .filter(Quiz.user_id == user_id, Quiz.score.is_not(None))
        .order_by(Quiz.created_at.desc(), Quiz.id.desc())
        .all()
    )
    attempts: dict[tuple[str, str], list[Quiz]] = {}
    for quiz in quizzes:
        attempts.setdefault((quiz.subject_name.strip().lower(), quiz.topic.strip().lower()), []).append(quiz)

    scheduled = _upcoming_revision_topics(db, user_id)
    result: list[WeakTopicOut] = []
    for (_, topic_key), items in attempts.items():
        recent = items[:RECENT_ATTEMPTS]
        average = sum(_quiz_percent(q) for q in recent) / len(recent)
        if average >= WEAK_THRESHOLD:
            continue
        latest = items[0]
        result.append(
            WeakTopicOut(
                subject_name=latest.subject_name,
                topic=latest.topic,
                attempts=len(items),
                average_percent=round(average, 1),
                last_percent=round(_quiz_percent(latest), 1),
                last_taken=latest.created_at,
                revision_scheduled=topic_key in scheduled,
            )
        )
    return sorted(result, key=lambda w: w.average_percent)


def _find_subject(db: Session, user_id: int, name: str) -> Subject | None:
    subjects = db.query(Subject).filter(Subject.user_id == user_id).all()
    wanted = name.strip().lower()
    for subject in subjects:
        if subject.name.lower() == wanted:
            return subject
    for subject in subjects:
        if subject.name.lower() in wanted or wanted in subject.name.lower():
            return subject
    return None


def _minutes(hhmm: str) -> int:
    try:
        hour, minute = (int(x) for x in hhmm.split(":")[:2])
    except ValueError:
        return 9 * 60
    return hour * 60 + minute


def _free_start(sessions: list[StudySession]) -> int:
    """Start 15 minutes after the day's last session, rounded up to a quarter hour; 18:00 on an empty day."""
    if not sessions:
        return 18 * 60
    end = max(_minutes(s.start_time) + s.duration_minutes for s in sessions) + 15
    return -(-end // 15) * 15


def schedule_revision(db: Session, user_id: int, subject_name: str, topic: str) -> StudySession:
    plan = _latest_plan(db, user_id)
    if not plan:
        raise HTTPException(status_code=400, detail="Generate a study plan first, then add revision sessions to it.")
    subject = _find_subject(db, user_id, subject_name)
    if not subject:
        raise HTTPException(status_code=400, detail=f'Add "{subject_name}" on the Subjects page first.')

    weak = next((w for w in weak_topics(db, user_id) if w.topic.lower() == topic.strip().lower()), None)
    day = date.today()
    for _ in range(14):
        day = next_available_date(day + timedelta(days=1), 0, plan.available_days)
        same_day = (
            db.query(StudySession)
            .filter(StudySession.plan_id == plan.id, StudySession.scheduled_date == day)
            .all()
        )
        start = _free_start(same_day)
        if start <= LATEST_REVISION_START:
            break
    else:
        raise HTTPException(status_code=400, detail="Your plan has no free time in the next two weeks.")

    goal = f"Re-read your notes on {topic}, then retake a quiz."
    if weak:
        goal = f"Your recent quiz average on {topic} is {weak.average_percent:g}%. " + goal
    session = StudySession(
        plan_id=plan.id,
        subject_id=subject.id,
        scheduled_date=day,
        start_time=f"{start // 60:02d}:{start % 60:02d}",
        duration_minutes=REVISION_MINUTES,
        topic=f"{REVISION_PREFIX}{topic.strip()}",
        goal=goal,
        status=SessionStatus.pending,
    )
    db.add(session)
    db.flush()
    create_session_reminder(db, user_id, session)
    db.commit()
    db.refresh(session)
    return session
