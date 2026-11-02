import json
import logging
import re
from collections.abc import Iterator
from typing import Any

import httpx
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_NOTES_CHARS = 24000


def _extract_json(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"Invalid JSON from AI: {exc}") from exc


def _openrouter_request() -> tuple[str, dict]:
    url = f"{settings.openrouter_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "AI Study Planner",
    }
    return url, headers


def _openrouter(messages: list[dict]) -> str:
    url, headers = _openrouter_request()
    with httpx.Client(timeout=settings.openrouter_timeout_seconds) as client:
        res = client.post(url, headers=headers, json={"model": settings.openrouter_model, "messages": messages})
    if res.status_code >= 400:
        raise RuntimeError(f"OpenRouter error {res.status_code}: {res.text[:200]}")
    choices = res.json().get("choices") or []
    text = (choices[0].get("message", {}).get("content") if choices else "") or ""
    if not text.strip():
        raise RuntimeError("OpenRouter returned an empty response")
    return text


def _openrouter_stream(messages: list[dict]) -> Iterator[str]:
    url, headers = _openrouter_request()
    body = {"model": settings.openrouter_model, "messages": messages, "stream": True}
    with httpx.Client(timeout=settings.openrouter_timeout_seconds) as client:
        with client.stream("POST", url, headers=headers, json=body) as res:
            if res.status_code >= 400:
                raise RuntimeError(f"OpenRouter error {res.status_code}: {res.read()[:200]!r}")
            for line in res.iter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    return
                chunk = json.loads(data)
                if chunk.get("error"):
                    raise RuntimeError(f"OpenRouter stream error: {chunk['error']}")
                choices = chunk.get("choices") or []
                delta = (choices[0].get("delta", {}).get("content") if choices else "") or ""
                if delta:
                    yield delta


def _gemini_setup(messages: list[dict]):
    from google import genai
    from google.genai import types

    system = "\n".join(m["content"] for m in messages if m["role"] == "system")
    contents = [
        types.Content(role="model" if m["role"] == "assistant" else "user", parts=[types.Part(text=m["content"])])
        for m in messages
        if m["role"] != "system"
    ]
    client = genai.Client(
        api_key=settings.gemini_api_key,
        http_options=types.HttpOptions(timeout=int(settings.gemini_timeout_seconds * 1000)),
    )
    config = types.GenerateContentConfig(system_instruction=system) if system else None
    models = [m for m in dict.fromkeys([settings.gemini_model, settings.gemini_fallback_model]) if m]
    return client, contents, config, models


def _gemini_stream(messages: list[dict]) -> Iterator[str]:
    client, contents, config, models = _gemini_setup(messages)
    last_error: Exception | None = None
    for model in models:
        produced = False
        try:
            for chunk in client.models.generate_content_stream(model=model, contents=contents, config=config):
                text = getattr(chunk, "text", None) or ""
                if text:
                    produced = True
                    yield text
        except Exception as exc:
            if produced:
                raise
            last_error = exc
            continue
        if produced:
            return
        last_error = RuntimeError(f"Gemini model {model} returned an empty response")
    raise RuntimeError(f"Gemini failed: {last_error}")


def _gemini(messages: list[dict]) -> str:
    client, contents, config, models = _gemini_setup(messages)
    last_error: Exception | None = None
    for model in models:
        try:
            response = client.models.generate_content(model=model, contents=contents, config=config)
        except Exception as exc:
            last_error = exc
            continue
        text = getattr(response, "text", None) or ""
        if text.strip():
            return text
        last_error = RuntimeError(f"Gemini model {model} returned an empty response")
    raise RuntimeError(f"Gemini failed: {last_error}")


AI_BUSY = "The AI service is busy right now. Please try again in a minute."


def _providers(stream: bool) -> list[tuple[str, Any]]:
    providers = []
    if settings.openrouter_api_key:
        providers.append(("OpenRouter", _openrouter_stream if stream else _openrouter))
    if settings.gemini_api_key:
        providers.append(("Gemini", _gemini_stream if stream else _gemini))
    if not providers:
        raise HTTPException(status_code=503, detail="No AI provider configured: set OPENROUTER_API_KEY or GEMINI_API_KEY")
    return providers


def _complete(messages: list[dict]) -> str:
    for name, call in _providers(stream=False):
        try:
            return call(messages)
        except Exception as exc:
            logger.warning("%s request failed, trying next provider: %s", name, exc)

    raise HTTPException(status_code=503, detail=AI_BUSY)


def _stream(messages: list[dict]) -> Iterator[str]:
    """Falls back to the next provider only if the current one fails before sending any text."""
    for name, call in _providers(stream=True):
        produced = False
        try:
            for delta in call(messages):
                produced = True
                yield delta
            if produced:
                return
            raise RuntimeError("empty response")
        except Exception as exc:
            if produced:
                logger.warning("%s stream broke midway: %s", name, exc)
                raise RuntimeError(AI_BUSY) from exc
            logger.warning("%s stream failed, trying next provider: %s", name, exc)

    raise RuntimeError(AI_BUSY)


def _ask(prompt: str) -> str:
    return _complete([{"role": "user", "content": prompt}])


def generate_study_plan_payload(
    subjects: list[dict],
    hours_per_day: float,
    available_days: list[str],
    start_date: str,
    weak_topics: list[dict] | None = None,
) -> list[dict]:
    prompt = f"""
You are an expert study planner. Create a realistic weekly study schedule as JSON only.

Input:
- start_date: {start_date}
- hours_per_day: {hours_per_day}
- available_days: {available_days}
- subjects: {json.dumps(subjects)}
- weak_topics (low quiz scores): {json.dumps(weak_topics or [])}

Return a JSON array of sessions for 14 days (only on available_days). Each item:
{{
  "day_offset": 0,
  "subject_name": "string",
  "topic": "string",
  "duration_minutes": 45,
  "start_time": "09:00",
  "goal": "string"
}}

Rules:
- Total minutes per day must not exceed hours_per_day * 60.
- Prioritize subjects with sooner exam_date and higher priority.
- Spread topics across days; include revision sessions.
- Give each weak topic at least one extra revision session early in the plan.
- Use 24h start_time HH:MM.
- Return ONLY valid JSON array, no markdown.
"""
    data = _extract_json(_ask(prompt))
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="AI plan must be a JSON array")
    return data


def _chat_messages(message: str, context: str, history: list[dict]) -> list[dict]:
    system = (
        "You are a helpful AI study assistant for college students. "
        "Reply clearly and concisely. Use bullet points when helpful.\n\n"
        f"Student context:\n{context}"
    )
    messages = [{"role": "system", "content": system}]
    messages += [{"role": h["role"], "content": h["content"]} for h in history[-10:]]
    if not history or history[-1]["content"] != message:
        messages.append({"role": "user", "content": message})
    return messages


def chat_reply(message: str, context: str, history: list[dict]) -> str:
    return _complete(_chat_messages(message, context, history)).strip()


def chat_reply_stream(message: str, context: str, history: list[dict]) -> Iterator[str]:
    return _stream(_chat_messages(message, context, history))


def _notes_block(notes: str | None) -> str:
    if not notes:
        return ""
    return (
        "\nBase every item ONLY on these student notes (ignore anything not covered by them):\n"
        f"<notes>\n{notes[:MAX_NOTES_CHARS]}\n</notes>\n"
    )


def summarize_notes(title: str, notes: str) -> str:
    prompt = f"""
Summarise these study notes titled "{title}" for a college student revising for an exam.

Format:
- A 2-3 sentence overview
- "Key points:" followed by 5-10 bullet points
- "Remember:" followed by important definitions, formulas or dates, if any

Use plain text with "-" bullets, no markdown headings.

<notes>
{notes[:MAX_NOTES_CHARS]}
</notes>
"""
    return _ask(prompt).strip()


def generate_quiz_questions(subject_name: str, topic: str, num_questions: int, notes: str | None = None) -> list[dict]:
    prompt = f"""
Generate {num_questions} multiple-choice quiz questions for subject "{subject_name}" on topic "{topic}".
{_notes_block(notes)}
Return ONLY JSON array:
[
  {{
    "question": "string",
    "options": ["A", "B", "C", "D"],
    "correct_index": 0
  }}
]

Rules:
- exactly 4 options per question
- correct_index is 0-3
- no markdown
"""
    data = _extract_json(_ask(prompt))
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="AI quiz must be a JSON array")
    return data


def generate_flashcards(subject_name: str, topic: str, count: int, notes: str | None = None) -> list[dict]:
    prompt = f"""
Generate {count} flashcards for subject "{subject_name}" topic "{topic}".
{_notes_block(notes)}
Return ONLY JSON array:
[
  {{ "front": "question or term", "back": "answer or definition" }}
]

No markdown.
"""
    data = _extract_json(_ask(prompt))
    if not isinstance(data, list):
        raise HTTPException(status_code=502, detail="AI flashcards must be a JSON array")
    return data
