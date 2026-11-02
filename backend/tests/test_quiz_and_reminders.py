from datetime import datetime, timedelta, timezone

from app.core.timeutils import utc_now_naive
from app.db.models import Reminder
from app.db.session import SessionLocal
from app.scheduler import mark_due_reminders
from app.services import ai_service

FAKE_QUIZ = [
    {"question": "2 + 2?", "options": ["3", "4", "5", "6"], "correct_index": 1},
    {"question": "Capital of France?", "options": ["Paris", "Rome", "Berlin", "Madrid"], "correct_index": 0},
]


def test_quiz_generate_and_submit(client, auth_headers, monkeypatch):
    monkeypatch.setattr(ai_service, "generate_quiz_questions", lambda *_: FAKE_QUIZ)
    quiz = client.post(
        "/quiz/generate",
        json={"subject_name": "General", "topic": "Basics", "num_questions": 2},
        headers=auth_headers,
    ).json()

    res = client.post(f"/quiz/{quiz['id']}/submit", json={"answers": [1, 2]}, headers=auth_headers)
    assert res.status_code == 200
    assert res.json() == {"score": 1, "total": 2, "percent": 50.0}


def test_missing_api_key_returns_503(client, auth_headers):
    res = client.post(
        "/quiz/generate",
        json={"subject_name": "General", "topic": "Basics", "num_questions": 2},
        headers=auth_headers,
    )
    assert res.status_code == 503


def test_future_reminder_is_not_due(client, auth_headers):
    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    client.post("/reminders", json={"title": "Later", "due_at": future}, headers=auth_headers)
    mark_due_reminders()
    assert client.get("/reminders/notifications", headers=auth_headers).json() == []


def test_scheduler_marks_overdue_reminder(client, auth_headers):
    user_id = client.get("/auth/me", headers=auth_headers).json()["id"]
    db = SessionLocal()
    db.add(Reminder(user_id=user_id, title="Revise", due_at=utc_now_naive() - timedelta(minutes=1)))
    db.commit()
    db.close()
    assert client.get("/reminders/notifications", headers=auth_headers).json() == []

    mark_due_reminders()

    notes = client.get("/reminders/notifications", headers=auth_headers).json()
    assert [n["title"] for n in notes] == ["Revise"]

    client.post(f"/reminders/{notes[0]['id']}/read", headers=auth_headers)
    assert client.get("/reminders/notifications", headers=auth_headers).json() == []
