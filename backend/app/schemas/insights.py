from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.plan import StudySessionOut


class WeakTopicOut(BaseModel):
    subject_name: str
    topic: str
    attempts: int
    average_percent: float
    last_percent: float
    last_taken: datetime
    revision_scheduled: bool


class RevisionRequest(BaseModel):
    subject_name: str = Field(min_length=1)
    topic: str = Field(min_length=1)


class FocusLogRequest(BaseModel):
    session_id: int | None = None
    minutes: int = Field(ge=1, le=240)
    mark_done: bool = False


class FocusResult(BaseModel):
    minutes_logged: int
    session: StudySessionOut | None = None


class DayStat(BaseModel):
    date: date
    minutes: int
    sessions_done: int


class WeekStat(BaseModel):
    week_start: date
    minutes: int
    sessions_done: int


class SubjectMinutes(BaseModel):
    subject_name: str
    minutes: int


class AnalyticsOut(BaseModel):
    total_minutes: int
    week_minutes: int
    week_sessions_done: int
    focus_sessions: int
    active_days: int
    quizzes_taken: int
    average_quiz_percent: float | None
    cards_reviewed: int
    cards_due: int
    weekly: list[WeekStat]
    heatmap: list[DayStat]
    subjects: list[SubjectMinutes]
