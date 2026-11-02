import os
import tempfile

_db_path = os.path.join(tempfile.gettempdir(), "study_planner_test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["OPENROUTER_API_KEY"] = ""
os.environ["GEMINI_API_KEY"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db.models import User  # noqa: E402
from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c


def register_and_login(client, email: str, name: str = "Test Student") -> dict:
    client.post("/auth/register", json={"email": email, "full_name": name, "password": "secret123"})
    res = client.post("/auth/login/json", json={"email": email, "password": "secret123"})
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture()
def auth_headers(client):
    return register_and_login(client, "student@example.com")


@pytest.fixture()
def admin_headers(client):
    headers = register_and_login(client, "admin@example.com", "Admin")
    db = SessionLocal()
    db.query(User).filter(User.email == "admin@example.com").update({"role": "admin"})
    db.commit()
    db.close()
    return headers
