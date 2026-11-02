from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.access import require_feature
from app.db.models import Note, User
from app.db.session import get_db
from app.deps import get_current_user
from app.schemas.notes import NoteFlashcardRequest, NoteListItem, NoteOut, NoteQuizRequest
from app.schemas.quiz import FlashcardOut, QuizOut
from app.services import ai_service
from app.services.activity import log_activity
from app.services.notes_service import extract_text
from app.services.study_tools import flashcard_out, save_flashcards, save_quiz

router = APIRouter(prefix="/notes", tags=["notes"])

MAX_NOTE_CHARS = 200_000


def _list_item(note: Note) -> NoteListItem:
    return NoteListItem(
        id=note.id,
        title=note.title,
        subject_name=note.subject_name,
        filename=note.filename,
        characters=len(note.content),
        has_summary=bool(note.summary),
        created_at=note.created_at,
    )


def _note_out(note: Note) -> NoteOut:
    return NoteOut(**_list_item(note).model_dump(), content=note.content, summary=note.summary)


def _get_note(db: Session, note_id: int, user_id: int) -> Note:
    note = db.get(Note, note_id)
    if not note or note.user_id != user_id:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


def _quiz_subject(note: Note) -> str:
    return note.subject_name or note.title


@router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def upload_note(
    file: UploadFile | None = File(default=None),
    text: str = Form(default=""),
    title: str = Form(default=""),
    subject_name: str = Form(default=""),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file and file.filename:
        content = extract_text(file)
        default_title = Path(file.filename).stem
    elif text.strip():
        content = text.strip()
        default_title = "Pasted notes"
    else:
        raise HTTPException(status_code=400, detail="Choose a file or paste some text.")

    note = Note(
        user_id=current_user.id,
        title=(title.strip() or default_title)[:255],
        subject_name=subject_name.strip()[:255],
        filename=(file.filename if file and file.filename else "")[:255],
        content=content[:MAX_NOTE_CHARS],
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    log_activity(db, current_user.id, "notes.upload", f"{note.title} ({len(note.content)} chars)")
    return _note_out(note)


@router.get("", response_model=list[NoteListItem])
def list_notes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    notes = db.query(Note).filter(Note.user_id == current_user.id).order_by(Note.id.desc()).all()
    return [_list_item(n) for n in notes]


@router.get("/{note_id}", response_model=NoteOut)
def get_note(note_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _note_out(_get_note(db, note_id, current_user.id))


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(note_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    note = _get_note(db, note_id, current_user.id)
    db.delete(note)
    db.commit()
    log_activity(db, current_user.id, "notes.delete", note.title)


@router.post("/{note_id}/summary", response_model=NoteOut)
def summarize_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_feature("chat")),
):
    note = _get_note(db, note_id, current_user.id)
    note.summary = ai_service.summarize_notes(note.title, note.content)
    db.commit()
    db.refresh(note)
    log_activity(db, current_user.id, "notes.summary", note.title)
    return _note_out(note)


@router.post("/{note_id}/quiz", response_model=QuizOut)
def quiz_from_note(
    note_id: int,
    payload: NoteQuizRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_feature("quiz")),
):
    note = _get_note(db, note_id, current_user.id)
    questions = ai_service.generate_quiz_questions(
        _quiz_subject(note), note.title, payload.num_questions, notes=note.content
    )
    quiz = save_quiz(db, current_user.id, _quiz_subject(note), note.title, questions)
    log_activity(db, current_user.id, "notes.quiz", note.title)
    return quiz


@router.post("/{note_id}/flashcards", response_model=list[FlashcardOut])
def flashcards_from_note(
    note_id: int,
    payload: NoteFlashcardRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = _get_note(db, note_id, current_user.id)
    cards = ai_service.generate_flashcards(_quiz_subject(note), note.title, payload.count, notes=note.content)
    created = save_flashcards(db, current_user.id, _quiz_subject(note), note.title, cards)
    log_activity(db, current_user.id, "notes.flashcards", note.title)
    return [flashcard_out(c) for c in created]
