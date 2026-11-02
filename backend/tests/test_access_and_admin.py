from datetime import timedelta

from app.core.timeutils import utc_now_naive
from app.db.models import User
from app.db.session import SessionLocal
from app.services import ai_service
from tests.conftest import register_and_login

FAKE_QUIZ = [{"question": "Q?", "options": ["a", "b", "c", "d"], "correct_index": 0}]
QUIZ_REQUEST = {"subject_name": "Maths", "topic": "Limits", "num_questions": 1}


def _set_user(email: str, **fields) -> None:
    db = SessionLocal()
    db.query(User).filter(User.email == email).update(fields)
    db.commit()
    db.close()


def _student_id(client, admin_headers, email="student@example.com") -> int:
    students = client.get("/admin/students", params={"search": email}, headers=admin_headers).json()
    return students[0]["id"]


def test_new_student_gets_24h_trial(client, auth_headers, monkeypatch):
    monkeypatch.setattr(ai_service, "generate_quiz_questions", lambda *_: FAKE_QUIZ)
    me = client.get("/auth/me", headers=auth_headers).json()
    assert me["role"] == "student"
    assert me["chat_access"] == "allowed"
    assert me["quiz_access"] == "allowed"
    assert client.post("/quiz/generate", json=QUIZ_REQUEST, headers=auth_headers).status_code == 200


def test_expired_trial_blocks_chat_and_quiz_with_402(client, auth_headers):
    _set_user("student@example.com", ai_access_until=utc_now_naive() - timedelta(minutes=1))

    me = client.get("/auth/me", headers=auth_headers).json()
    assert me["chat_access"] == "expired"

    res = client.post("/chat", json={"message": "hi"}, headers=auth_headers)
    assert res.status_code == 402
    assert res.json()["detail"]["code"] == "ai_access_expired"
    assert client.post("/quiz/generate", json=QUIZ_REQUEST, headers=auth_headers).status_code == 402
    assert client.get("/subjects", headers=auth_headers).status_code == 200


def test_admin_can_disable_one_feature(client, auth_headers, admin_headers, monkeypatch):
    monkeypatch.setattr(ai_service, "generate_quiz_questions", lambda *_: FAKE_QUIZ)
    student_id = _student_id(client, admin_headers)

    res = client.patch(f"/admin/students/{student_id}", json={"chat_enabled": False}, headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["chat_access"] == "disabled"

    chat = client.post("/chat", json={"message": "hi"}, headers=auth_headers)
    assert chat.status_code == 403
    assert chat.json()["detail"]["code"] == "feature_disabled"
    assert client.post("/quiz/generate", json=QUIZ_REQUEST, headers=auth_headers).status_code == 200


def test_admin_extends_and_revokes_access(client, auth_headers, admin_headers):
    _set_user("student@example.com", ai_access_until=utc_now_naive() - timedelta(days=1))
    student_id = _student_id(client, admin_headers)

    extended = client.patch(f"/admin/students/{student_id}", json={"extend_days": 7}, headers=admin_headers).json()
    assert extended["quiz_access"] == "allowed"

    revoked = client.patch(f"/admin/students/{student_id}", json={"revoke_access": True}, headers=admin_headers).json()
    assert revoked["quiz_access"] == "expired"


def test_deactivated_student_cannot_log_in(client, auth_headers, admin_headers):
    student_id = _student_id(client, admin_headers)
    client.patch(f"/admin/students/{student_id}", json={"is_active": False}, headers=admin_headers)

    assert client.get("/auth/me", headers=auth_headers).status_code == 401
    res = client.post("/auth/login/json", json={"email": "student@example.com", "password": "secret123"})
    assert res.status_code == 403


def test_admin_cannot_deactivate_self(client, admin_headers):
    admin_id = _student_id(client, admin_headers, "admin@example.com")
    res = client.patch(f"/admin/students/{admin_id}", json={"is_active": False}, headers=admin_headers)
    assert res.status_code == 400


def test_admin_has_ai_access_without_trial(client, admin_headers):
    _set_user("admin@example.com", ai_access_until=None)
    me = client.get("/auth/me", headers=admin_headers).json()
    assert me["chat_access"] == "allowed"
    assert me["quiz_access"] == "allowed"


def test_students_cannot_use_admin_endpoints(client, auth_headers):
    for path in ("/admin/students", "/admin/activity", "/admin/stats", "/admin/payments"):
        assert client.get(path, headers=auth_headers).status_code == 403


def test_activity_log_records_logins_and_actions(client, admin_headers):
    student = register_and_login(client, "logger@example.com", "Logger")
    client.post("/auth/login/json", json={"email": "logger@example.com", "password": "wrong-pass"})
    client.post("/subjects", json={"name": "Physics"}, headers=student)

    student_id = _student_id(client, admin_headers, "logger@example.com")
    page = client.get("/admin/activity", params={"user_id": student_id}, headers=admin_headers).json()
    actions = [item["action"] for item in page["items"]]
    assert actions[:4] == ["subject.create", "login.failed", "login", "register"]
    assert page["items"][0]["detail"] == "Physics"
    assert page["items"][0]["user_email"] == "logger@example.com"

    logins = client.get("/admin/activity", params={"action": "login"}, headers=admin_headers).json()
    assert {item["action"] for item in logins["items"]} <= {"login", "login.failed", "login.blocked"}


def test_admin_stats(client, auth_headers, admin_headers):
    stats = client.get("/admin/stats", headers=admin_headers).json()
    assert stats["students_total"] == 1
    assert stats["logins_24h"] == 2
    assert stats["students_with_ai_access"] == 1
