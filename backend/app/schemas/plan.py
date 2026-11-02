from datetime import date, datetime

from pydantic import BaseModel, Field

from app.db.models import SessionStatus


class PlanGenerateRequest(BaseModel):
    hours_per_day: float = Field(gt=0, le=16)
    available_days: list[str] = Field(default_factory=lambda: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
    start_date: date | None = None


class StudySessionOut(BaseModel):
    id: int
    plan_id: int
    subject_id: int
    scheduled_date: date
    start_time: str
    duration_minutes: int
    topic: str
    goal: str
    status: SessionStatus
    subject_name: str | None = None
    focused_minutes: int = 0

    model_config = {"from_attributes": True}


class StudyPlanOut(BaseModel):
    id: int
    user_id: int
    hours_per_day: float
    available_days: list[str]
    start_date: date
    created_at: datetime
    sessions: list[StudySessionOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class SessionUpdate(BaseModel):
    scheduled_date: date | None = None
    start_time: str | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    status: SessionStatus | None = None


class ProgressSubject(BaseModel):
    subject_id: int
    subject_name: str
    total_sessions: int
    completed_sessions: int
    completion_percent: float


class ProgressOut(BaseModel):
    subjects: list[ProgressSubject]
    current_streak: int
    total_sessions: int
    completed_sessions: int
