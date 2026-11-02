import hashlib
import hmac
import time
from datetime import timedelta

import httpx
from fastapi import HTTPException

from app.core.config import settings
from app.core.timeutils import utc_now_naive
from app.db.models import User

RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders"

PLANS: dict[str, dict] = {
    "weekly": {"name": "Weekly", "days": 7, "amount": 4900, "description": "7 days of AI chat and quizzes"},
    "monthly": {"name": "Monthly", "days": 30, "amount": 14900, "description": "30 days of AI chat and quizzes"},
    "semester": {"name": "Semester", "days": 180, "amount": 49900, "description": "180 days, best for exam season"},
}


def get_plan(plan_id: str) -> dict:
    plan = PLANS.get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Unknown plan")
    return plan


def _require_keys() -> None:
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        raise HTTPException(status_code=503, detail="Payments are not configured yet. Please contact the admin.")


def create_order(user: User, plan_id: str) -> dict:
    _require_keys()
    plan = get_plan(plan_id)
    res = httpx.post(
        RAZORPAY_ORDERS_URL,
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
        json={
            "amount": plan["amount"],
            "currency": "INR",
            "receipt": f"u{user.id}-{plan_id}-{int(time.time())}",
            "notes": {"user_id": str(user.id), "plan_id": plan_id},
        },
        timeout=20,
    )
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Razorpay error: {res.text[:200]}")
    return res.json()


def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    expected = hmac.new(
        settings.razorpay_key_secret.encode(),
        f"{order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def extend_access(user: User, days: int) -> None:
    now = utc_now_naive()
    base = user.ai_access_until if user.ai_access_until and user.ai_access_until > now else now
    user.ai_access_until = base + timedelta(days=days)
