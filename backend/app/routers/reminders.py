from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.timeutils import to_utc_naive, utc_now_naive
from app.db.models import Reminder, User
from app.db.session import get_db
from app.deps import get_current_user
from app.schemas.reminder import ReminderCreate, ReminderOut
from app.services.activity import log_activity

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("/notifications", response_model=list[ReminderOut])
def notifications(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Reminder)
        .filter(Reminder.user_id == current_user.id, Reminder.is_due == True, Reminder.is_read == False)  # noqa: E712
        .order_by(Reminder.due_at.asc())
        .all()
    )


@router.get("", response_model=list[ReminderOut])
def list_reminders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Reminder)
        .filter(Reminder.user_id == current_user.id)
        .order_by(Reminder.due_at.desc())
        .limit(50)
        .all()
    )


@router.post("", response_model=ReminderOut, status_code=status.HTTP_201_CREATED)
def create_reminder(
    payload: ReminderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    due_at = to_utc_naive(payload.due_at)
    reminder = Reminder(
        user_id=current_user.id,
        title=payload.title,
        message=payload.message,
        due_at=due_at,
        is_due=due_at <= utc_now_naive(),
        is_read=False,
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    log_activity(db, current_user.id, "reminder.create", payload.title)
    return reminder


@router.post("/{reminder_id}/read", response_model=ReminderOut)
def mark_read(
    reminder_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reminder = db.get(Reminder, reminder_id)
    if not reminder or reminder.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    reminder.is_read = True
    db.commit()
    db.refresh(reminder)
    return reminder
