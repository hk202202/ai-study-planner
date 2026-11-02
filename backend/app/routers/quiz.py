from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.access import require_feature
from app.core.timeutils import utc_now_naive
from app.db.models import Flashcard, Quiz, User
from app.db.session import get_db
from app.deps import get_current_user
from app.schemas.quiz import (
    FlashcardGenerateRequest,
    FlashcardOut,
    FlashcardReviewRequest,
    QuizGenerateRequest,
    QuizOut,
    QuizSubmitRequest,
    QuizSubmitResponse,
)
from app.services import ai_service, srs_service
from app.services.activity import log_activity
from app.services.study_tools import flashcard_out, save_flashcards, save_quiz

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/generate", response_model=QuizOut)
def generate_quiz(
    payload: QuizGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_feature("quiz")),
):
    questions = ai_service.generate_quiz_questions(
        payload.subject_name, payload.topic, payload.num_questions
    )
    quiz = save_quiz(db, current_user.id, payload.subject_name, payload.topic, questions)
    log_activity(db, current_user.id, "quiz.generate", f"{payload.subject_name}: {payload.topic}")
    return quiz


@router.get("", response_model=list[QuizOut])
def list_quizzes(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Quiz).filter(Quiz.user_id == current_user.id).order_by(Quiz.created_at.desc()).all()


@router.post("/flashcards/generate", response_model=list[FlashcardOut])
def generate_flashcards(
    payload: FlashcardGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cards = ai_service.generate_flashcards(payload.subject_name, payload.topic, payload.count)
    created = save_flashcards(db, current_user.id, payload.subject_name, payload.topic, cards)
    log_activity(db, current_user.id, "flashcards.generate", f"{payload.subject_name}: {payload.topic}")
    return [flashcard_out(c) for c in created]


@router.get("/flashcards/list", response_model=list[FlashcardOut])
def list_flashcards(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cards = (
        db.query(Flashcard)
        .filter(Flashcard.user_id == current_user.id)
        .order_by(Flashcard.created_at.desc())
        .limit(100)
        .all()
    )
    return [flashcard_out(c) for c in cards]


@router.get("/flashcards/due", response_model=list[FlashcardOut])
def due_flashcards(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    cards = (
        db.query(Flashcard)
        .filter(
            Flashcard.user_id == current_user.id,
            Flashcard.due_at.is_(None) | (Flashcard.due_at <= utc_now_naive()),
        )
        .order_by(Flashcard.due_at.is_(None), Flashcard.due_at, Flashcard.id)
        .limit(100)
        .all()
    )
    return [flashcard_out(c) for c in cards]


@router.post("/flashcards/{card_id}/review", response_model=FlashcardOut)
def review_flashcard(
    card_id: int,
    payload: FlashcardReviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    card = db.get(Flashcard, card_id)
    if not card or card.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Flashcard not found")
    srs_service.review(card, payload.rating, utc_now_naive())
    db.commit()
    db.refresh(card)
    return flashcard_out(card)


@router.get("/{quiz_id}", response_model=QuizOut)
def get_quiz(quiz_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    quiz = db.get(Quiz, quiz_id)
    if not quiz or quiz.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


@router.post("/{quiz_id}/submit", response_model=QuizSubmitResponse)
def submit_quiz(
    quiz_id: int,
    payload: QuizSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_feature("quiz")),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz or quiz.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    questions = quiz.questions or []
    if len(payload.answers) != len(questions):
        raise HTTPException(status_code=400, detail="Answer count mismatch")
    score = 0
    for ans, q in zip(payload.answers, questions):
        if ans == q.get("correct_index"):
            score += 1
    quiz.score = score
    db.commit()
    total = len(questions)
    log_activity(db, current_user.id, "quiz.submit", f"{quiz.subject_name}: {quiz.topic} scored {score}/{total}")
    return QuizSubmitResponse(score=score, total=total, percent=round(score / total * 100, 1) if total else 0)
