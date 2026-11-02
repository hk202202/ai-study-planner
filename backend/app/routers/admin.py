from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.access import feature_status, require_admin
from app.core.timeutils import utc_now_naive
from app.db.models import (
    ActivityLog,
    Payment,
    PaymentStatus,
    SessionStatus,
    StudyPlan,
    StudySession,
    Subject,
    User,
    UserRole,
)
from app.db.session import get_db
from app.schemas.admin import (
    ActivityOut,
    ActivityPage,
    AdminPaymentOut,
    AdminStats,
    StudentOut,
    StudentUpdate,
)
from app.services.activity import log_activity

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])

AI_ACTIONS = (
    "chat.message",
    "quiz.generate",
    "flashcards.generate",
    "plan.generate",
    "notes.summary",
    "notes.quiz",
    "notes.flashcards",
)


def _student_out(db: Session, user: User) -> StudentOut:
    sessions = (
        db.query(StudySession.status)
        .join(StudyPlan, StudyPlan.id == StudySession.plan_id)
        .filter(StudyPlan.user_id == user.id)
        .all()
    )
    paid = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.user_id == user.id, Payment.status == PaymentStatus.paid.value)
        .scalar()
    )
    return StudentOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        chat_enabled=user.chat_enabled,
        quiz_enabled=user.quiz_enabled,
        chat_access=feature_status(user, "chat"),
        quiz_access=feature_status(user, "quiz"),
        ai_access_until=user.ai_access_until,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        subjects_count=db.query(Subject).filter(Subject.user_id == user.id).count(),
        sessions_done=sum(1 for (s,) in sessions if s == SessionStatus.done),
        sessions_total=len(sessions),
        ai_requests=db.query(ActivityLog)
        .filter(ActivityLog.user_id == user.id, ActivityLog.action.in_(AI_ACTIONS))
        .count(),
        total_paid=paid / 100,
    )


@router.get("/stats", response_model=AdminStats)
def stats(db: Session = Depends(get_db)):
    now = utc_now_naive()
    since = now - timedelta(hours=24)
    students = db.query(User).filter(User.role == UserRole.student.value)
    revenue = (
        db.query(func.coalesce(func.sum(Payment.amount), 0))
        .filter(Payment.status == PaymentStatus.paid.value)
        .scalar()
    )
    return AdminStats(
        students_total=students.count(),
        students_active=students.filter(User.is_active.is_(True)).count(),
        logins_24h=db.query(func.count(func.distinct(ActivityLog.user_id)))
        .filter(ActivityLog.action == "login", ActivityLog.created_at >= since)
        .scalar(),
        ai_requests_24h=db.query(ActivityLog)
        .filter(ActivityLog.action.in_(AI_ACTIONS), ActivityLog.created_at >= since)
        .count(),
        students_with_ai_access=students.filter(User.ai_access_until > now).count(),
        paid_students=db.query(func.count(func.distinct(Payment.user_id)))
        .filter(Payment.status == PaymentStatus.paid.value)
        .scalar(),
        revenue=revenue / 100,
    )


@router.get("/students", response_model=list[StudentOut])
def list_students(search: str = "", db: Session = Depends(get_db)):
    query = db.query(User)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(func.lower(User.email).like(like) | func.lower(User.full_name).like(like))
    return [_student_out(db, u) for u in query.order_by(User.created_at.desc()).all()]


@router.patch("/students/{student_id}", response_model=StudentOut)
def update_student(
    student_id: int,
    payload: StudentUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    student = db.get(User, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if student.id == admin.id and (payload.is_active is False or payload.role == UserRole.student.value):
        raise HTTPException(status_code=400, detail="You cannot deactivate or demote your own account")

    changes: list[str] = []
    for field in ("is_active", "chat_enabled", "quiz_enabled", "role"):
        value = getattr(payload, field)
        if value is not None and getattr(student, field) != value:
            setattr(student, field, value)
            changes.append(f"{field}={value}")

    now = utc_now_naive()
    if payload.extend_days:
        base = student.ai_access_until if student.ai_access_until and student.ai_access_until > now else now
        student.ai_access_until = base + timedelta(days=payload.extend_days)
        changes.append(f"access +{payload.extend_days}d")
    if payload.revoke_access:
        student.ai_access_until = now
        changes.append("access revoked")

    db.commit()
    db.refresh(student)
    if changes:
        log_activity(db, admin.id, "admin.update_student", f"{student.email}: {', '.join(changes)}")
    return _student_out(db, student)


@router.get("/activity", response_model=ActivityPage)
def activity(
    user_id: int | None = None,
    action: str = "",
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(ActivityLog, User).outerjoin(User, User.id == ActivityLog.user_id)
    if user_id:
        query = query.filter(ActivityLog.user_id == user_id)
    if action:
        query = query.filter(ActivityLog.action.like(f"{action}%"))
    total = query.count()
    rows = query.order_by(ActivityLog.id.desc()).offset(offset).limit(limit).all()
    items = [
        ActivityOut(
            id=log.id,
            user_id=log.user_id,
            user_email=user.email if user else None,
            user_name=user.full_name if user else None,
            action=log.action,
            detail=log.detail,
            ip=log.ip,
            created_at=log.created_at,
        )
        for log, user in rows
    ]
    return ActivityPage(items=items, total=total)


@router.get("/payments", response_model=list[AdminPaymentOut])
def payments(db: Session = Depends(get_db)):
    rows = db.query(Payment, User).join(User, User.id == Payment.user_id).order_by(Payment.id.desc()).limit(200).all()
    return [
        AdminPaymentOut(
            id=p.id,
            user_email=u.email,
            user_name=u.full_name,
            plan_id=p.plan_id,
            amount=p.amount / 100,
            currency=p.currency,
            status=p.status,
            razorpay_order_id=p.razorpay_order_id,
            razorpay_payment_id=p.razorpay_payment_id,
            created_at=p.created_at,
            paid_at=p.paid_at,
        )
        for p, u in rows
    ]
