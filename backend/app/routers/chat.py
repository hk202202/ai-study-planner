import json
from collections.abc import Iterator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.access import require_feature
from app.db.models import ChatMessage, StudyPlan, StudySession, Subject, User
from app.db.session import SessionLocal, get_db
from app.deps import get_current_user
from app.schemas.chat import ChatMessageOut, ChatRequest, ChatResponse
from app.services import ai_service
from app.services.activity import log_activity

router = APIRouter(prefix="/chat", tags=["chat"])


def _build_context(db: Session, user_id: int) -> str:
    subjects = db.query(Subject).filter(Subject.user_id == user_id).all()
    plan = (
        db.query(StudyPlan).filter(StudyPlan.user_id == user_id).order_by(StudyPlan.created_at.desc()).first()
    )
    lines = ["Subjects:"]
    for s in subjects:
        topics = ", ".join(s.topics or [])
        lines.append(f"- {s.name} (exam: {s.exam_date}, topics: {topics})")
    if plan:
        upcoming = (
            db.query(StudySession)
            .filter(StudySession.plan_id == plan.id)
            .order_by(StudySession.scheduled_date)
            .limit(5)
            .all()
        )
        lines.append("Upcoming sessions:")
        for u in upcoming:
            lines.append(f"- {u.scheduled_date} {u.start_time}: {u.topic}")
    return "\n".join(lines)


def _recent_messages(db: Session, user_id: int, limit: int) -> list[ChatMessage]:
    rows = (
        db.query(ChatMessage)
        .filter(ChatMessage.user_id == user_id)
        .order_by(ChatMessage.id.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(rows))


@router.get("/history", response_model=list[ChatMessageOut])
def history(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _recent_messages(db, current_user.id, 50)


@router.post("", response_model=ChatResponse)
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_feature("chat")),
):
    user_msg = ChatMessage(user_id=current_user.id, role="user", content=payload.message)
    db.add(user_msg)
    db.commit()

    history = [{"role": m.role, "content": m.content} for m in _recent_messages(db, current_user.id, 20)]
    context = _build_context(db, current_user.id)
    reply_text = ai_service.chat_reply(payload.message, context, history)

    assistant_msg = ChatMessage(user_id=current_user.id, role="assistant", content=reply_text)
    db.add(assistant_msg)
    db.commit()
    log_activity(db, current_user.id, "chat.message", payload.message[:200])

    return ChatResponse(reply=reply_text, history=_recent_messages(db, current_user.id, 50))


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


@router.post("/stream")
def chat_stream(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_feature("chat")),
):
    """Server-sent events: {"delta"} chunks, then {"done", "message"} or {"error"}."""
    user_msg = ChatMessage(user_id=current_user.id, role="user", content=payload.message)
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)
    user_out = ChatMessageOut.model_validate(user_msg).model_dump(mode="json")

    history = [{"role": m.role, "content": m.content} for m in _recent_messages(db, current_user.id, 20)]
    deltas = ai_service.chat_reply_stream(payload.message, _build_context(db, current_user.id), history)
    try:
        first = next(deltas)
    except (RuntimeError, StopIteration) as exc:
        raise HTTPException(status_code=503, detail=str(exc) or ai_service.AI_BUSY) from exc
    log_activity(db, current_user.id, "chat.message", payload.message[:200])
    user_id = current_user.id

    def events() -> Iterator[str]:
        parts = [first]
        yield _sse({"delta": first})
        error = None
        try:
            for delta in deltas:
                parts.append(delta)
                yield _sse({"delta": delta})
        except RuntimeError as exc:
            error = str(exc)
        with SessionLocal() as session:
            reply = ChatMessage(user_id=user_id, role="assistant", content="".join(parts).strip())
            session.add(reply)
            session.commit()
            session.refresh(reply)
            message = ChatMessageOut.model_validate(reply).model_dump(mode="json")
        if error:
            yield _sse({"error": error, "message": message, "user_message": user_out})
        else:
            yield _sse({"done": True, "message": message, "user_message": user_out})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
