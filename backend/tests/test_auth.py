def test_register_and_login(client):
    res = client.post(
        "/auth/register",
        json={"email": "New@Example.com", "full_name": "New User", "password": "secret123"},
    )
    assert res.status_code == 201
    assert res.json()["email"] == "new@example.com"

    res = client.post("/auth/login", data={"username": "new@example.com", "password": "secret123"})
    assert res.status_code == 200
    token = res.json()["access_token"]

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["full_name"] == "New User"


def test_duplicate_email_rejected(client, auth_headers):
    res = client.post(
        "/auth/register",
        json={"email": "student@example.com", "full_name": "Again", "password": "secret123"},
    )
    assert res.status_code == 400


def test_wrong_password_rejected(client, auth_headers):
    res = client.post("/auth/login/json", json={"email": "student@example.com", "password": "wrong-pass"})
    assert res.status_code == 401


def test_protected_route_requires_token(client):
    assert client.get("/subjects").status_code == 401
