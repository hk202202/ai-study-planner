from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from app.core.timeutils import utc_now_naive
from app.db.models import Reminder
from app.db.session import SessionLocal

scheduler = BackgroundScheduler()


def mark_due_reminders() -> None:
    db: Session = SessionLocal()
    try:
        now = utc_now_naive()
        due = db.query(Reminder).filter(Reminder.is_due == False, Reminder.due_at <= now).all()  # noqa: E712
        for r in due:
            r.is_due = True
        if due:
            db.commit()
    finally:
        db.close()


def start_scheduler() -> None:
    if not scheduler.running:
        scheduler.add_job(mark_due_reminders, "interval", minutes=1, id="mark_due_reminders")
        scheduler.start()


def stop_scheduler() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
