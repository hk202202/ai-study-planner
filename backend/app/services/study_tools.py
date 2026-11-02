from sqlalchemy.orm import Session

from app.db.models import Flashcard, Quiz
from app.schemas.quiz import FlashcardOut
from app.services import srs_service


def save_quiz(db: Session, user_id: int, subject_name: str, topic: str, questions: list[dict]) -> Quiz:
    quiz = Quiz(user_id=user_id, subject_name=subject_name, topic=topic, questions=questions)
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz


def save_flashcards(db: Session, user_id: int, subject_name: str, topic: str, cards: list[dict]) -> list[Flashcard]:
    created = [
        Flashcard(
            user_id=user_id,
            subject_name=subject_name,
            topic=topic,
            front=str(c.get("front", "")),
            back=str(c.get("back", "")),
        )
        for c in cards
    ]
    db.add_all(created)
    db.commit()
    for card in created:
        db.refresh(card)
    return created


def flashcard_out(card: Flashcard) -> FlashcardOut:
    out = FlashcardOut.model_validate(card)
    out.next_review = srs_service.preview(card)
    return out
