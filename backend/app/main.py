from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import init_db
from app.routers import admin, auth, chat, focus, insights, notes, payments, plans, quiz, reminders, sessions, subjects
from app.scheduler import start_scheduler, stop_scheduler
from app.services.activity import client_ip


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="AI Study Planner API", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def capture_client_ip(request: Request, call_next):
    forwarded = request.headers.get("x-forwarded-for", "")
    client_ip.set(forwarded.split(",")[0].strip() or (request.client.host if request.client else ""))
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(subjects.router)
app.include_router(plans.router)
app.include_router(sessions.router)
app.include_router(chat.router)
app.include_router(quiz.router)
app.include_router(reminders.router)
app.include_router(notes.router)
app.include_router(focus.router)
app.include_router(insights.router)
app.include_router(payments.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}
