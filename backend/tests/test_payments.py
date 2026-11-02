import hashlib
import hmac
from datetime import timedelta

from app.core.config import settings
from app.core.timeutils import utc_now_naive
from app.db.models import User
from app.db.session import SessionLocal
from app.services import payment_service

TEST_SECRET = "test_secret"


def _configure(monkeypatch):
    monkeypatch.setattr(settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(settings, "razorpay_key_secret", TEST_SECRET)
    monkeypatch.setattr(
        payment_service,
        "create_order",
        lambda user, plan_id: {"id": f"order_{plan_id}_{user.id}", "amount": payment_service.PLANS[plan_id]["amount"], "currency": "INR"},
    )


def _sign(order_id: str, payment_id: str) -> str:
    return hmac.new(TEST_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()


def _expire(email: str) -> None:
    db = SessionLocal()
    db.query(User).filter(User.email == email).update({"ai_access_until": utc_now_naive() - timedelta(hours=1)})
    db.commit()
    db.close()


def test_plans_listed(client, auth_headers):
    plans = client.get("/payments/plans", headers=auth_headers).json()
    assert [p["id"] for p in plans] == ["weekly", "monthly", "semester"]
    assert plans[0]["amount"] == 49.0


def test_order_without_keys_returns_503(client, auth_headers):
    res = client.post("/payments/order", json={"plan_id": "weekly"}, headers=auth_headers)
    assert res.status_code == 503


def test_successful_payment_restores_access(client, auth_headers, monkeypatch):
    _configure(monkeypatch)
    _expire("student@example.com")
    assert client.get("/auth/me", headers=auth_headers).json()["quiz_access"] == "expired"

    order = client.post("/payments/order", json={"plan_id": "weekly"}, headers=auth_headers).json()
    assert order["key_id"] == "rzp_test_key"
    assert order["amount"] == 4900

    res = client.post(
        "/payments/verify",
        json={
            "razorpay_order_id": order["order_id"],
            "razorpay_payment_id": "pay_123",
            "razorpay_signature": _sign(order["order_id"], "pay_123"),
        },
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["quiz_access"] == "allowed"

    history = client.get("/payments/mine", headers=auth_headers).json()
    assert history[0]["status"] == "paid"


def test_bad_signature_is_rejected(client, auth_headers, monkeypatch):
    _configure(monkeypatch)
    _expire("student@example.com")
    order = client.post("/payments/order", json={"plan_id": "monthly"}, headers=auth_headers).json()

    res = client.post(
        "/payments/verify",
        json={"razorpay_order_id": order["order_id"], "razorpay_payment_id": "pay_1", "razorpay_signature": "forged"},
        headers=auth_headers,
    )
    assert res.status_code == 400
    assert client.get("/auth/me", headers=auth_headers).json()["quiz_access"] == "expired"


def test_payment_extends_existing_access(client, auth_headers, monkeypatch):
    _configure(monkeypatch)
    before = client.get("/auth/me", headers=auth_headers).json()["ai_access_until"]
    order = client.post("/payments/order", json={"plan_id": "weekly"}, headers=auth_headers).json()
    after = client.post(
        "/payments/verify",
        json={
            "razorpay_order_id": order["order_id"],
            "razorpay_payment_id": "pay_2",
            "razorpay_signature": _sign(order["order_id"], "pay_2"),
        },
        headers=auth_headers,
    ).json()["ai_access_until"]
    assert after > before
