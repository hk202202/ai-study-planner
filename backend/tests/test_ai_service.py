import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.services import ai_service


def _fail(_messages):
    raise RuntimeError("down")


def test_falls_back_to_gemini_when_openrouter_fails(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "or-key")
    monkeypatch.setattr(settings, "gemini_api_key", "gm-key")
    monkeypatch.setattr(ai_service, "_openrouter", _fail)
    monkeypatch.setattr(ai_service, "_gemini", lambda _messages: "from gemini")

    assert ai_service.chat_reply("hi", "context", []) == "from gemini"


def test_uses_openrouter_first(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "or-key")
    monkeypatch.setattr(settings, "gemini_api_key", "gm-key")
    monkeypatch.setattr(ai_service, "_openrouter", lambda _messages: "from openrouter")
    monkeypatch.setattr(ai_service, "_gemini", _fail)

    assert ai_service.chat_reply("hi", "context", []) == "from openrouter"


def test_all_providers_failing_returns_503(monkeypatch):
    monkeypatch.setattr(settings, "openrouter_api_key", "or-key")
    monkeypatch.setattr(settings, "gemini_api_key", "gm-key")
    monkeypatch.setattr(ai_service, "_openrouter", _fail)
    monkeypatch.setattr(ai_service, "_gemini", _fail)

    with pytest.raises(HTTPException) as exc:
        ai_service.chat_reply("hi", "context", [])
    assert exc.value.status_code == 503
