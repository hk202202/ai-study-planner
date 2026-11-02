from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.access import to_user_out
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.core.timeutils import utc_now_naive
from app.db.models import User
from app.db.session import get_db
from app.deps import get_current_user
from app.schemas.auth import Token, UserLogin, UserOut, UserRegister
from app.services.activity import log_activity

router = APIRouter(prefix="/auth", tags=["auth"])


def _authenticate(db: Session, email: str, password: str) -> Token:
    email = email.lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        log_activity(db, user.id if user else None, "login.failed", email)
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        log_activity(db, user.id, "login.blocked", "account deactivated")
        raise HTTPException(status_code=403, detail="Your account has been deactivated. Contact your admin.")
    user.last_login_at = utc_now_naive()
    log_activity(db, user.id, "login")
    return Token(access_token=create_access_token(str(user.id)))


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        hashed_password=get_password_hash(payload.password),
        ai_access_until=utc_now_naive() + timedelta(hours=settings.trial_hours),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_activity(db, user.id, "register", f"{settings.trial_hours}h free trial started")
    return to_user_out(user)


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    return _authenticate(db, form_data.username, form_data.password)


@router.post("/login/json", response_model=Token)
def login_json(payload: UserLogin, db: Session = Depends(get_db)):
    return _authenticate(db, payload.email, payload.password)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    log_activity(db, current_user.id, "logout")


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return to_user_out(current_user)
