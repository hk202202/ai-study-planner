"""Spaced repetition based on SM-2: each good answer multiplies the gap before a card is shown again."""

from datetime import datetime, timedelta
from typing import Literal

from app.db.models import Flashcard

Rating = Literal["again", "good", "easy"]

MIN_EASE = 1.3
AGAIN_MINUTES = 10


def _next_state(ease: float, interval: int, repetitions: int, rating: Rating) -> tuple[float, int, int]:
    """Returns (ease, interval_days, repetitions). An interval of 0 means "again in a few minutes"."""
    if rating == "again":
        return max(MIN_EASE, ease - 0.2), 0, 0
    repetitions += 1
    if rating == "good":
        if repetitions == 1:
            return ease, 1, repetitions
        if repetitions == 2:
            return ease, 3, repetitions
        return ease, max(round(interval * ease), interval + 1), repetitions
    ease += 0.15
    if repetitions == 1:
        return ease, 4, repetitions
    return ease, max(round(max(interval, 1) * ease * 1.3), interval + 2), repetitions


def _label(interval: int) -> str:
    if interval == 0:
        return f"{AGAIN_MINUTES} min"
    if interval < 30:
        return f"{interval} day" + ("" if interval == 1 else "s")
    months = round(interval / 30)
    return f"{months} month" + ("" if months == 1 else "s")


def preview(card: Flashcard) -> dict[str, str]:
    return {
        rating: _label(_next_state(card.ease, card.interval_days, card.repetitions, rating)[1])
        for rating in ("again", "good", "easy")
    }


def review(card: Flashcard, rating: Rating, now: datetime) -> None:
    card.ease, card.interval_days, card.repetitions = _next_state(
        card.ease, card.interval_days, card.repetitions, rating
    )
    card.last_reviewed_at = now
    card.due_at = now + (timedelta(minutes=AGAIN_MINUTES) if card.interval_days == 0 else timedelta(days=card.interval_days))
