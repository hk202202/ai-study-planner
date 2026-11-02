from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session, joinedload

from app.core.timeutils import utc_now_naive
from app.db.models import Flashcard, FocusLog, Quiz, SessionStatus, StudyPlan, StudySession
from app.schemas.insights import AnalyticsOut, DayStat, SubjectMinutes, WeekStat

HEATMAP_WEEKS = 20
CHART_WEEKS = 8


def _local_date(utc_naive: datetime) -> date:
    return utc_naive.replace(tzinfo=timezone.utc).astimezone().date()


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def summary(db: Session, user_id: int) -> AnalyticsOut:
    """Study minutes are timer minutes; sessions marked done without the timer count their planned length."""
    today = date.today()
    minutes: dict[date, int] = defaultdict(int)
    done: dict[date, int] = defaultdict(int)
    by_subject: dict[str, int] = defaultdict(int)

    logs = db.query(FocusLog).filter(FocusLog.user_id == user_id).all()
    timed_sessions = {log.session_id for log in logs if log.session_id}
    for log in logs:
        minutes[_local_date(log.ended_at)] += log.minutes
        by_subject[log.subject_name or "Other"] += log.minutes

    done_sessions = (
        db.query(StudySession)
        .join(StudyPlan, StudyPlan.id == StudySession.plan_id)
        .options(joinedload(StudySession.subject))
        .filter(
            StudyPlan.user_id == user_id,
            StudySession.status == SessionStatus.done,
            StudySession.scheduled_date <= today,
        )
        .all()
    )
    for s in done_sessions:
        done[s.scheduled_date] += 1
        if s.id not in timed_sessions:
            minutes[s.scheduled_date] += s.duration_minutes
            by_subject[s.subject.name if s.subject else "Other"] += s.duration_minutes

    this_week = _week_start(today)
    heatmap_start = this_week - timedelta(weeks=HEATMAP_WEEKS - 1)
    heatmap = [
        DayStat(date=d, minutes=minutes[d], sessions_done=done[d])
        for d in (heatmap_start + timedelta(days=i) for i in range((today - heatmap_start).days + 1))
    ]
    weekly = []
    for i in range(CHART_WEEKS - 1, -1, -1):
        start = this_week - timedelta(weeks=i)
        days = [start + timedelta(days=n) for n in range(7)]
        weekly.append(
            WeekStat(
                week_start=start,
                minutes=sum(minutes[d] for d in days),
                sessions_done=sum(done[d] for d in days),
            )
        )

    quizzes = db.query(Quiz).filter(Quiz.user_id == user_id, Quiz.score.is_not(None)).all()
    percents = [q.score / len(q.questions) * 100 for q in quizzes if q.questions]
    now = utc_now_naive()
    cards = db.query(Flashcard).filter(Flashcard.user_id == user_id)

    return AnalyticsOut(
        total_minutes=sum(minutes.values()),
        week_minutes=weekly[-1].minutes,
        week_sessions_done=weekly[-1].sessions_done,
        focus_sessions=len(logs),
        active_days=sum(1 for v in minutes.values() if v),
        quizzes_taken=len(quizzes),
        average_quiz_percent=round(sum(percents) / len(percents), 1) if percents else None,
        cards_reviewed=cards.filter(Flashcard.last_reviewed_at.is_not(None)).count(),
        cards_due=cards.filter((Flashcard.due_at.is_(None)) | (Flashcard.due_at <= now)).count(),
        weekly=weekly,
        heatmap=heatmap,
        subjects=sorted(
            (SubjectMinutes(subject_name=name, minutes=m) for name, m in by_subject.items() if m),
            key=lambda s: -s.minutes,
        ),
    )
