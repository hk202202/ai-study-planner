from pydantic import BaseModel, Field

from app.schemas.auth import AccessStatus
from app.schemas.common import UTCDateTime


class StudentOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    chat_enabled: bool
    quiz_enabled: bool
    chat_access: AccessStatus
    quiz_access: AccessStatus
    ai_access_until: UTCDateTime | None
    last_login_at: UTCDateTime | None
    created_at: UTCDateTime
    subjects_count: int
    sessions_done: int
    sessions_total: int
    ai_requests: int
    total_paid: float


class StudentUpdate(BaseModel):
    is_active: bool | None = None
    chat_enabled: bool | None = None
    quiz_enabled: bool | None = None
    role: str | None = Field(default=None, pattern="^(student|admin)$")
    extend_days: int | None = Field(default=None, ge=1, le=365)
    revoke_access: bool | None = None


class ActivityOut(BaseModel):
    id: int
    user_id: int | None
    user_email: str | None
    user_name: str | None
    action: str
    detail: str
    ip: str
    created_at: UTCDateTime


class ActivityPage(BaseModel):
    items: list[ActivityOut]
    total: int


class AdminStats(BaseModel):
    students_total: int
    students_active: int
    logins_24h: int
    ai_requests_24h: int
    students_with_ai_access: int
    paid_students: int
    revenue: float


class AdminPaymentOut(BaseModel):
    id: int
    user_email: str
    user_name: str
    plan_id: str
    amount: float
    currency: str
    status: str
    razorpay_order_id: str
    razorpay_payment_id: str | None
    created_at: UTCDateTime
    paid_at: UTCDateTime | None
