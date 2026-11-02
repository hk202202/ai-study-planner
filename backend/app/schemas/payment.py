from pydantic import BaseModel

from app.schemas.common import UTCDateTime


class PlanOut(BaseModel):
    id: str
    name: str
    days: int
    amount: float
    description: str


class OrderRequest(BaseModel):
    plan_id: str


class OrderOut(BaseModel):
    order_id: str
    amount: int
    currency: str
    key_id: str
    plan: PlanOut


class VerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PaymentOut(BaseModel):
    id: int
    plan_id: str
    amount: float
    currency: str
    status: str
    created_at: UTCDateTime
    paid_at: UTCDateTime | None
