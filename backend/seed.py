"""Create an admin account and a demo student with sample subjects. Run from backend/: python seed.py"""

from datetime import date, timedelta

from app.core.config import settings
from app.core.security import get_password_hash
from app.core.timeutils import utc_now_naive
from app.db.models import Subject, User, UserRole
from app.db.session import SessionLocal, init_db

ADMIN_EMAIL = "admin@studyplanner.com"
ADMIN_PASSWORD = "admin1234"
DEMO_EMAIL = "demo@student.com"
DEMO_PASSWORD = "demo1234"

SUBJECTS = [
    ("Data Structures", 14, 4, 5, ["Arrays", "Linked Lists", "Stacks and Queues", "Trees", "Graphs", "Hashing"]),
    ("Operating Systems", 18, 4, 4, ["Processes", "CPU Scheduling", "Deadlocks", "Memory Management", "File Systems"]),
    ("Database Management", 21, 3, 4, ["ER Model", "Normalization", "SQL Queries", "Transactions", "Indexing"]),
    ("Engineering Mathematics", 25, 5, 3, ["Matrices", "Differential Equations", "Probability", "Laplace Transform"]),
]


def _ensure_admin(db) -> None:
    admin = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if admin:
        admin.role = UserRole.admin.value
        print(f"Admin already exists: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        return
    db.add(
        User(
            email=ADMIN_EMAIL,
            full_name="Admin",
            hashed_password=get_password_hash(ADMIN_PASSWORD),
            role=UserRole.admin.value,
        )
    )
    print(f"Created admin {ADMIN_EMAIL} / {ADMIN_PASSWORD}")


def _ensure_demo_student(db) -> None:
    trial_end = utc_now_naive() + timedelta(hours=settings.trial_hours)
    user = db.query(User).filter(User.email == DEMO_EMAIL).first()
    if user:
        if not user.ai_access_until:
            user.ai_access_until = trial_end
        print(f"Demo student already exists: {DEMO_EMAIL} / {DEMO_PASSWORD}")
        return
    user = User(
        email=DEMO_EMAIL,
        full_name="Demo Student",
        hashed_password=get_password_hash(DEMO_PASSWORD),
        ai_access_until=trial_end,
    )
    db.add(user)
    db.flush()
    for name, days_to_exam, difficulty, priority, topics in SUBJECTS:
        db.add(
            Subject(
                user_id=user.id,
                name=name,
                exam_date=date.today() + timedelta(days=days_to_exam),
                difficulty=difficulty,
                priority=priority,
                topics=topics,
            )
        )
    print(f"Created demo student {DEMO_EMAIL} / {DEMO_PASSWORD} with {len(SUBJECTS)} subjects")


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        _ensure_admin(db)
        _ensure_demo_student(db)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
