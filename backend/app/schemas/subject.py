from datetime import date

from pydantic import BaseModel, Field


class SubjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    exam_date: date | None = None
    difficulty: int = Field(default=3, ge=1, le=5)
    priority: int = Field(default=3, ge=1, le=5)
    topics: list[str] = Field(default_factory=list)


class SubjectCreate(SubjectBase):
    pass


class SubjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    exam_date: date | None = None
    difficulty: int | None = Field(default=None, ge=1, le=5)
    priority: int | None = Field(default=None, ge=1, le=5)
    topics: list[str] | None = None


class SubjectOut(SubjectBase):
    id: int
    user_id: int

    model_config = {"from_attributes": True}
