from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import UTCDateTime

AccessStatus = Literal["allowed", "disabled", "expired"]


class UserRegister(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: str
    is_active: bool
    chat_enabled: bool
    quiz_enabled: bool
    ai_access_until: UTCDateTime | None
    chat_access: AccessStatus
    quiz_access: AccessStatus
