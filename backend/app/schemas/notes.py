from pydantic import BaseModel, Field

from app.schemas.common import UTCDateTime


class NoteListItem(BaseModel):
    id: int
    title: str
    subject_name: str
    filename: str
    characters: int
    has_summary: bool
    created_at: UTCDateTime


class NoteOut(NoteListItem):
    content: str
    summary: str | None


class NoteQuizRequest(BaseModel):
    num_questions: int = Field(default=5, ge=1, le=15)


class NoteFlashcardRequest(BaseModel):
    count: int = Field(default=10, ge=1, le=30)
