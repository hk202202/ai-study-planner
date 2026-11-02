import json
from datetime import date, timedelta

import pytest

from app.core.config import settings
from app.core.timeutils import utc_now_naive
from app.db.models import Flashcard
from app.db.session import SessionLocal
from app.services import ai_service, srs_service

FAKE_QUIZ = [
    {"question": "Q1?", "options": ["a", "b", "c", "d"], "correct_index": 0},
    {"question": "Q2?", "options": ["a", "b", "c", "d"], "correct_index": 1},
]
FAKE_CARDS = [{"front": "Term", "back": "Meaning"}, {"front": "Other", "back": "Answer"}]
FAKE_PLAN = [
    {"day_offset": 0, "subject_name": "Biology", "topic": "Cells", "duration_minutes": 60, "start_time": "09:00"},
]


def _pdf_with_text(text: str) -> bytes:
    stream = f"BT /F1 18 Tf 20 100 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    body = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(len(body))
        body += b"%d 0 obj\n" % i + obj + b"\nendobj\n"
    xref = len(body)
    body += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    body += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    body += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objects) + 1, xref)
    return body


def _make_plan(client, headers, monkeypatch, captured=None):
    def fake_plan(**kwargs):
        if captured is not None:
            captured.update(kwargs)
        return FAKE_PLAN

    monkeypatch.setattr(ai_service, "generate_study_plan_payload", fake_plan)
    client.post("/subjects", json={"name": "Biology", "topics": ["Cells"]}, headers=headers)
    res = client.post("/plans/generate", json={"hours_per_day": 2, "start_date": date.today().isoformat()}, headers=headers)
    assert res.status_code == 200
    return res.json()


def _take_quiz(client, headers, monkeypatch, answers, topic="Cells"):
    monkeypatch.setattr(ai_service, "generate_quiz_questions", lambda *a, **k: FAKE_QUIZ)
    quiz = client.post(
        "/quiz/generate", json={"subject_name": "Biology", "topic": topic, "num_questions": 2}, headers=headers
    ).json()
    client.post(f"/quiz/{quiz['id']}/submit", json={"answers": answers}, headers=headers)


# Notes


def test_upload_text_note_and_generate_from_it(client, auth_headers, monkeypatch):
    res = client.post(
        "/notes",
        files={"file": ("photosynthesis.txt", b"Plants turn light into chemical energy.", "text/plain")},
        data={"subject_name": "Biology"},
        headers=auth_headers,
    )
    assert res.status_code == 201
    note = res.json()
    assert note["title"] == "photosynthesis"
    assert note["content"] == "Plants turn light into chemical energy."
    assert [n["id"] for n in client.get("/notes", headers=auth_headers).json()] == [note["id"]]

    monkeypatch.setattr(ai_service, "summarize_notes", lambda title, notes: f"Summary of {title}")
    res = client.post(f"/notes/{note['id']}/summary", headers=auth_headers)
    assert res.json()["summary"] == "Summary of photosynthesis"

    seen = {}

    def fake_quiz(subject, topic, count, notes=None):
        seen.update(subject=subject, topic=topic, notes=notes)
        return FAKE_QUIZ

    monkeypatch.setattr(ai_service, "generate_quiz_questions", fake_quiz)
    quiz = client.post(f"/notes/{note['id']}/quiz", json={"num_questions": 2}, headers=auth_headers).json()
    assert quiz["subject_name"] == "Biology" and quiz["topic"] == "photosynthesis"
    assert seen["notes"] == note["content"]

    monkeypatch.setattr(ai_service, "generate_flashcards", lambda *a, **k: FAKE_CARDS)
    cards = client.post(f"/notes/{note['id']}/flashcards", json={"count": 2}, headers=auth_headers).json()
    assert [c["front"] for c in cards] == ["Term", "Other"]

    assert client.delete(f"/notes/{note['id']}", headers=auth_headers).status_code == 204
    assert client.get("/notes", headers=auth_headers).json() == []


def test_upload_pdf_and_pasted_text(client, auth_headers):
    res = client.post(
        "/notes",
        files={"file": ("cells.pdf", _pdf_with_text("Mitochondria make energy"), "application/pdf")},
        headers=auth_headers,
    )
    assert res.status_code == 201, res.text
    assert "Mitochondria make energy" in res.json()["content"]

    res = client.post("/notes", data={"text": "Some pasted notes", "title": "Lecture 3"}, headers=auth_headers)
    assert res.json()["title"] == "Lecture 3"


@pytest.mark.parametrize(
    ("files", "data"),
    [({"file": ("slides.pptx", b"x", "application/octet-stream")}, {}), (None, {"text": "   "})],
)
def test_upload_rejects_bad_input(client, auth_headers, files, data):
    assert client.post("/notes", files=files, data=data, headers=auth_headers).status_code == 400


def test_cannot_read_other_users_note(client, auth_headers):
    note = client.post("/notes", data={"text": "private"}, headers=auth_headers).json()
    client.post("/auth/register", json={"email": "x@example.com", "full_name": "X", "password": "secret123"})
    token = client.post("/auth/login/json", json={"email": "x@example.com", "password": "secret123"}).json()
    res = client.get(f"/notes/{note['id']}", headers={"Authorization": f"Bearer {token['access_token']}"})
    assert res.status_code == 404


# Weak topics


def test_low_quiz_scores_become_weak_topic_and_revision_is_scheduled(client, auth_headers, monkeypatch):
    _take_quiz(client, auth_headers, monkeypatch, answers=[3, 3])
    _take_quiz(client, auth_headers, monkeypatch, answers=[0, 1], topic="Genetics")

    weak = client.get("/insights/weak-topics", headers=auth_headers).json()
    assert [(w["topic"], w["average_percent"], w["revision_scheduled"]) for w in weak] == [("Cells", 0.0, False)]

    res = client.post("/insights/revision", json={"subject_name": "Biology", "topic": "Cells"}, headers=auth_headers)
    assert res.status_code == 400
    assert "study plan" in res.json()["detail"]

    _make_plan(client, auth_headers, monkeypatch)
    res = client.post("/insights/revision", json={"subject_name": "Biology", "topic": "Cells"}, headers=auth_headers)
    assert res.status_code == 200
    session = res.json()
    assert session["topic"] == "Revision: Cells"
    assert session["scheduled_date"] == (date.today() + timedelta(days=1)).isoformat()
    assert session["start_time"] == "18:00"
    assert client.get("/insights/weak-topics", headers=auth_headers).json()[0]["revision_scheduled"] is True


def test_recent_good_scores_clear_weak_topic(client, auth_headers, monkeypatch):
    _take_quiz(client, auth_headers, monkeypatch, answers=[3, 3])
    for _ in range(3):
        _take_quiz(client, auth_headers, monkeypatch, answers=[0, 1])
    assert client.get("/insights/weak-topics", headers=auth_headers).json() == []


def test_plan_generation_receives_weak_topics(client, auth_headers, monkeypatch):
    _take_quiz(client, auth_headers, monkeypatch, answers=[3, 3])
    captured = {}
    _make_plan(client, auth_headers, monkeypatch, captured)
    assert captured["weak_topics"] == [{"subject": "Biology", "topic": "Cells", "average_percent": 0.0}]


# Focus timer and analytics


def test_focus_log_marks_session_done_and_feeds_analytics(client, auth_headers, monkeypatch):
    session = _make_plan(client, auth_headers, monkeypatch)["sessions"][0]

    res = client.post("/focus", json={"session_id": session["id"], "minutes": 25}, headers=auth_headers)
    assert res.json()["session"]["focused_minutes"] == 25
    res = client.post(
        "/focus", json={"session_id": session["id"], "minutes": 10, "mark_done": True}, headers=auth_headers
    )
    assert res.json()["session"]["status"] == "done"
    assert res.json()["session"]["focused_minutes"] == 35
    client.post("/focus", json={"minutes": 5}, headers=auth_headers)

    stats = client.get("/insights/analytics", headers=auth_headers).json()
    assert stats["total_minutes"] == 40
    assert stats["week_minutes"] == 40
    assert stats["week_sessions_done"] == 1
    assert stats["focus_sessions"] == 3
    assert stats["heatmap"][-1] == {"date": date.today().isoformat(), "minutes": 40, "sessions_done": 1}
    assert len(stats["weekly"]) == 8
    assert stats["subjects"][0] == {"subject_name": "Biology", "minutes": 35}


def test_done_session_without_timer_counts_planned_minutes(client, auth_headers, monkeypatch):
    session = _make_plan(client, auth_headers, monkeypatch)["sessions"][0]
    client.patch(f"/sessions/{session['id']}", json={"status": "done"}, headers=auth_headers)
    assert client.get("/insights/analytics", headers=auth_headers).json()["total_minutes"] == 60


def test_focus_rejects_other_users_session(client, auth_headers, monkeypatch):
    session = _make_plan(client, auth_headers, monkeypatch)["sessions"][0]
    client.post("/auth/register", json={"email": "y@example.com", "full_name": "Y", "password": "secret123"})
    token = client.post("/auth/login/json", json={"email": "y@example.com", "password": "secret123"}).json()
    res = client.post(
        "/focus",
        json={"session_id": session["id"], "minutes": 5},
        headers={"Authorization": f"Bearer {token['access_token']}"},
    )
    assert res.status_code == 404


# Spaced repetition


def test_srs_intervals_grow_and_again_resets():
    ease, interval, reps = 2.5, 0, 0
    intervals = []
    for _ in range(4):
        ease, interval, reps = srs_service._next_state(ease, interval, reps, "good")
        intervals.append(interval)
    assert intervals == [1, 3, 8, 20]
    assert srs_service._next_state(ease, interval, reps, "again") == (2.3, 0, 0)
    assert srs_service._next_state(2.5, 0, 0, "easy")[1] == 4


def test_review_moves_card_out_of_due_list(client, auth_headers, monkeypatch):
    monkeypatch.setattr(ai_service, "generate_flashcards", lambda *a, **k: FAKE_CARDS)
    cards = client.post(
        "/quiz/flashcards/generate", json={"subject_name": "Bio", "topic": "Cells", "count": 2}, headers=auth_headers
    ).json()
    assert cards[0]["next_review"] == {"again": "10 min", "good": "1 day", "easy": "4 days"}
    assert len(client.get("/quiz/flashcards/due", headers=auth_headers).json()) == 2

    res = client.post(f"/quiz/flashcards/{cards[0]['id']}/review", json={"rating": "good"}, headers=auth_headers)
    assert res.json()["interval_days"] == 1
    client.post(f"/quiz/flashcards/{cards[1]['id']}/review", json={"rating": "again"}, headers=auth_headers)
    assert client.get("/quiz/flashcards/due", headers=auth_headers).json() == []

    db = SessionLocal()
    db.query(Flashcard).filter(Flashcard.id == cards[1]["id"]).update({"due_at": utc_now_naive() - timedelta(minutes=1)})
    db.commit()
    db.close()
    assert [c["id"] for c in client.get("/quiz/flashcards/due", headers=auth_headers).json()] == [cards[1]["id"]]


# Streaming chat


def _events(body: str) -> list[dict]:
    return [json.loads(line[5:]) for line in body.splitlines() if line.startswith("data:")]


def test_chat_stream_sends_deltas_and_saves_reply(client, auth_headers, monkeypatch):
    monkeypatch.setattr(ai_service, "chat_reply_stream", lambda *a: iter(["Hel", "lo!"]))
    res = client.post("/chat/stream", json={"message": "hi"}, headers=auth_headers)
    assert res.status_code == 200
    events = _events(res.text)
    assert [e["delta"] for e in events if "delta" in e] == ["Hel", "lo!"]
    assert events[-1]["done"] is True
    assert events[-1]["message"]["content"] == "Hello!"
    history = client.get("/chat/history", headers=auth_headers).json()
    assert [(m["role"], m["content"]) for m in history] == [("user", "hi"), ("assistant", "Hello!")]


def test_chat_stream_returns_503_when_ai_fails_before_first_word(client, auth_headers, monkeypatch):
    def broken(*_):
        raise RuntimeError("The AI service is busy")
        yield  # pragma: no cover

    monkeypatch.setattr(ai_service, "chat_reply_stream", broken)
    res = client.post("/chat/stream", json={"message": "hi"}, headers=auth_headers)
    assert res.status_code == 503


def test_stream_falls_back_to_gemini_before_first_token(monkeypatch):
    def broken(_messages):
        raise RuntimeError("down")
        yield  # pragma: no cover

    monkeypatch.setattr(settings, "openrouter_api_key", "or-key")
    monkeypatch.setattr(settings, "gemini_api_key", "gm-key")
    monkeypatch.setattr(ai_service, "_openrouter_stream", broken)
    monkeypatch.setattr(ai_service, "_gemini_stream", lambda _messages: iter(["from ", "gemini"]))
    assert "".join(ai_service.chat_reply_stream("hi", "ctx", [])) == "from gemini"
