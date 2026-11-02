from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.access import to_user_out
from app.core.config import settings
from app.core.timeutils import utc_now_naive
from app.db.models import Payment, PaymentStatus, User
from app.db.session import get_db
from app.deps import get_current_user
from app.schemas.auth import UserOut
from app.schemas.payment import OrderOut, OrderRequest, PaymentOut, PlanOut, VerifyRequest
from app.services import payment_service
from app.services.activity import log_activity

router = APIRouter(prefix="/payments", tags=["payments"])


def _plan_out(plan_id: str) -> PlanOut:
    plan = payment_service.get_plan(plan_id)
    return PlanOut(id=plan_id, name=plan["name"], days=plan["days"], amount=plan["amount"] / 100, description=plan["description"])


@router.get("/plans", response_model=list[PlanOut])
def plans():
    return [_plan_out(plan_id) for plan_id in payment_service.PLANS]


@router.post("/order", response_model=OrderOut)
def create_order(
    payload: OrderRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    order = payment_service.create_order(current_user, payload.plan_id)
    db.add(
        Payment(
            user_id=current_user.id,
            plan_id=payload.plan_id,
            amount=order["amount"],
            currency=order["currency"],
            razorpay_order_id=order["id"],
        )
    )
    db.commit()
    log_activity(db, current_user.id, "payment.order", f"{payload.plan_id} {order['id']}")
    return OrderOut(
        order_id=order["id"],
        amount=order["amount"],
        currency=order["currency"],
        key_id=settings.razorpay_key_id,
        plan=_plan_out(payload.plan_id),
    )


@router.post("/verify", response_model=UserOut)
def verify(
    payload: VerifyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    payment = (
        db.query(Payment)
        .filter(Payment.razorpay_order_id == payload.razorpay_order_id, Payment.user_id == current_user.id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Order not found")
    if payment.status == PaymentStatus.paid.value:
        return to_user_out(current_user)

    if not payment_service.verify_signature(
        payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature
    ):
        payment.status = PaymentStatus.failed.value
        db.commit()
        log_activity(db, current_user.id, "payment.failed", f"{payment.razorpay_order_id}: bad signature")
        raise HTTPException(status_code=400, detail="Payment verification failed")

    plan = payment_service.get_plan(payment.plan_id)
    payment.status = PaymentStatus.paid.value
    payment.razorpay_payment_id = payload.razorpay_payment_id
    payment.paid_at = utc_now_naive()
    payment_service.extend_access(current_user, plan["days"])
    db.commit()
    db.refresh(current_user)
    log_activity(
        db, current_user.id, "payment.success", f"{payment.plan_id} Rs {payment.amount / 100:.0f} +{plan['days']}d"
    )
    return to_user_out(current_user)


@router.get("/mine", response_model=list[PaymentOut])
def my_payments(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(Payment).filter(Payment.user_id == current_user.id).order_by(Payment.id.desc()).all()
    return [
        PaymentOut(
            id=p.id,
            plan_id=p.plan_id,
            amount=p.amount / 100,
            currency=p.currency,
            status=p.status,
            created_at=p.created_at,
            paid_at=p.paid_at,
        )
        for p in rows
    ]
