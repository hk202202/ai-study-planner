from typing import Literal

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.timeutils import utc_now_naive
from app.db.models import User, UserRole
from app.db.session import get_db
from app.deps import get_current_user
from app.schemas.auth import UserOut
from app.services.activity import log_activity

Feature = Literal["chat", "quiz"]
AccessStatus = Literal["allowed", "disabled", "expired"]

FEATURE_FLAGS: dict[str, str] = {"chat": "chat_enabled", "quiz": "quiz_enabled"}
FEATURE_LABELS: dict[str, str] = {"chat": "AI chat", "quiz": "AI quizzes"}


def is_admin(user: User) -> bool:
    return user.role == UserRole.admin.value


def feature_status(user: User, feature: Feature) -> AccessStatus:
    if is_admin(user):
        return "allowed"
    if not getattr(user, FEATURE_FLAGS[feature]):
        return "disabled"
    if not user.ai_access_until or user.ai_access_until <= utc_now_naive():
        return "expired"
    return "allowed"


def to_user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        chat_enabled=user.chat_enabled,
        quiz_enabled=user.quiz_enabled,
        ai_access_until=user.ai_access_until,
        chat_access=feature_status(user, "chat"),
        quiz_access=feature_status(user, "quiz"),
    )


def require_feature(feature: Feature):
    def dependency(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> User:
        state = feature_status(user, feature)
        if state == "allowed":
            return user
        log_activity(db, user.id, "access.denied", f"{feature}: {state}")
        if state == "disabled":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "feature_disabled",
                    "feature": feature,
                    "message": f"Your admin has turned off {FEATURE_LABELS[feature]} for your account.",
                },
            )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "ai_access_expired",
                "feature": feature,
                "message": "Your AI access has ended. Recharge to continue.",
            },
        )

    return dependency


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not is_admin(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
