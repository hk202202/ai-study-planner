from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import UTCDateTime


class ReminderCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    message: str = ""
    due_at: datetime


class ReminderOut(BaseModel):
    id: int
    title: str
    message: str
    due_at: UTCDateTime
    is_due: bool
    is_read: bool
    session_id: int | None

    model_config = {"from_attributes": True}
