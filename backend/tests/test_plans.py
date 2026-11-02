from datetime import date, timedelta

from app.services import ai_service

FAKE_PLAN = [
    {"day_offset": 0, "subject_name": "Maths", "topic": "Limits", "duration_minutes": 60, "start_time": "09:00", "goal": "Basics"},
    {"day_offset": 0, "subject_name": "Physics", "topic": "Motion", "duration_minutes": 45, "start_time": "11:00", "goal": "Laws"},
    {"day_offset": 1, "subject_name": "maths", "topic": "Derivatives", "duration_minutes": 60, "start_time": "09:00", "goal": "Rules"},
]


def _add_subjects(client, headers):
    for name in ("Maths", "Physics"):
        res = client.post(
            "/subjects",
            json={"name": name, "difficulty": 3, "priority": 4, "topics": ["Intro"]},
            headers=headers,
        )
        assert res.status_code == 201


def test_generate_plan_requires_subjects(client, auth_headers):
    res = client.post("/plans/generate", json={"hours_per_day": 2}, headers=auth_headers)
    assert res.status_code == 400


def test_generate_plan_creates_sessions_and_reminders(client, auth_headers, monkeypatch):
    monkeypatch.setattr(ai_service, "generate_study_plan_payload", lambda **_: FAKE_PLAN)
    _add_subjects(client, auth_headers)

    start = date.today().isoformat()
    res = client.post(
        "/plans/generate",
        json={"hours_per_day": 3, "available_days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "start_date": start},
        headers=auth_headers,
    )
    assert res.status_code == 200
    sessions = res.json()["sessions"]
    assert len(sessions) == 3
    assert {s["subject_name"] for s in sessions} == {"Maths", "Physics"}

    reminders = client.get("/reminders", headers=auth_headers).json()
    assert len(reminders) == 3


def test_regenerate_replaces_old_plan(client, auth_headers, monkeypatch):
    monkeypatch.setattr(ai_service, "generate_study_plan_payload", lambda **_: FAKE_PLAN)
    _add_subjects(client, auth_headers)
    client.post("/plans/generate", json={"hours_per_day": 3}, headers=auth_headers)
    client.post("/plans/generate", json={"hours_per_day": 3}, headers=auth_headers)

    assert len(client.get("/sessions", headers=auth_headers).json()) == 3


def test_progress_and_streak(client, auth_headers, monkeypatch):
    today = date.today()
    yesterday = today - timedelta(days=1)
    monkeypatch.setattr(ai_service, "generate_study_plan_payload", lambda **_: FAKE_PLAN)
    _add_subjects(client, auth_headers)
    plan = client.post(
        "/plans/generate",
        json={"hours_per_day": 3, "start_date": yesterday.isoformat()},
        headers=auth_headers,
    ).json()

    by_date = {}
    for s in plan["sessions"]:
        by_date.setdefault(s["scheduled_date"], []).append(s)
    for s in by_date[yesterday.isoformat()][:1] + by_date[today.isoformat()][:1]:
        res = client.patch(f"/sessions/{s['id']}", json={"status": "done"}, headers=auth_headers)
        assert res.status_code == 200

    progress = client.get("/plans/progress", headers=auth_headers).json()
    assert progress["completed_sessions"] == 2
    assert progress["total_sessions"] == 3
    assert progress["current_streak"] == 2
    maths = next(p for p in progress["subjects"] if p["subject_name"] == "Maths")
    assert maths["completion_percent"] > 0


def test_cannot_edit_other_users_session(client, auth_headers, monkeypatch):
    monkeypatch.setattr(ai_service, "generate_study_plan_payload", lambda **_: FAKE_PLAN)
    _add_subjects(client, auth_headers)
    session_id = client.post("/plans/generate", json={"hours_per_day": 3}, headers=auth_headers).json()["sessions"][0]["id"]

    client.post("/auth/register", json={"email": "other@example.com", "full_name": "Other", "password": "secret123"})
    token = client.post("/auth/login/json", json={"email": "other@example.com", "password": "secret123"}).json()["access_token"]
    res = client.patch(f"/sessions/{session_id}", json={"status": "done"}, headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 404
