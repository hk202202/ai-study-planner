from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import UTCDateTime


class QuizGenerateRequest(BaseModel):
    subject_name: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    num_questions: int = Field(default=5, ge=1, le=15)


class QuizQuestion(BaseModel):
    question: str
    options: list[str]
    correct_index: int


class QuizOut(BaseModel):
    id: int
    subject_name: str
    topic: str
    questions: list[QuizQuestion]
    score: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class QuizSubmitRequest(BaseModel):
    answers: list[int]


class QuizSubmitResponse(BaseModel):
    score: int
    total: int
    percent: float


class FlashcardGenerateRequest(BaseModel):
    subject_name: str = Field(min_length=1)
    topic: str = Field(min_length=1)
    count: int = Field(default=10, ge=1, le=30)


class FlashcardOut(BaseModel):
    id: int
    subject_name: str
    topic: str
    front: str
    back: str
    created_at: datetime
    due_at: UTCDateTime | None = None
    interval_days: int = 0
    repetitions: int = 0
    next_review: dict[str, str] = Field(default_factory=dict)

    model_config = {"from_attributes": True}


class FlashcardReviewRequest(BaseModel):
    rating: Literal["again", "good", "easy"]
