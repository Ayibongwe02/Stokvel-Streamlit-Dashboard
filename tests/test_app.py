import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# The app module builds its single Flask instance (and SQLite engine) at
# import time, so point it at a throwaway test database *before* the
# first import happens.
_db_fd, _DB_PATH = tempfile.mkstemp(suffix=".db")
os.environ["DATABASE_PATH"] = _DB_PATH
os.environ["WTF_CSRF_ENABLED"] = "False"

import pytest  # noqa: E402

from app import app as flask_app  # noqa: E402
from src.models import db as _db  # noqa: E402

flask_app.config.update(TESTING=True, WTF_CSRF_ENABLED=False)


@pytest.fixture(autouse=True)
def _reset_db():
    with flask_app.app_context():
        _db.drop_all()
        _db.create_all()
    yield


@pytest.fixture()
def app():
    return flask_app


@pytest.fixture()
def client(app):
    with app.test_client() as client:
        yield client


def signup(client, email="member@example.com", name="Test Member", password="s3cur3pass"):
    return client.post(
        "/auth/signup",
        data={"name": name, "email": email, "password": password, "confirm_password": password},
        follow_redirects=True,
    )


def create_group(client, name="My Stokvel", region="Gauteng"):
    return client.post("/groups/create", data={"name": name, "region": region}, follow_redirects=True)


@pytest.fixture()
def logged_in_with_group(client):
    signup(client)
    create_group(client)
    return client


def test_healthz(client):
    resp = client.get("/healthz")
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"


def test_overview_requires_login(client):
    resp = client.get("/", follow_redirects=True)
    assert resp.status_code == 200
    assert b"Log in" in resp.data


def test_signup_then_redirected_to_groups(client):
    resp = signup(client)
    assert resp.status_code == 200
    assert b"group" in resp.data.lower()


def test_overview_after_group_created(logged_in_with_group):
    resp = logged_in_with_group.get("/")
    assert resp.status_code == 200
    assert b"Group Overview" in resp.data


def test_forecast_page_default(logged_in_with_group):
    resp = logged_in_with_group.get("/forecast")
    assert resp.status_code == 200
    assert b"Member Balance Forecast" in resp.data


def test_accuracy_page(logged_in_with_group):
    resp = logged_in_with_group.get("/accuracy")
    assert resp.status_code == 200
    assert b"Forecast Model Accuracy" in resp.data


def test_regional_page(logged_in_with_group):
    resp = logged_in_with_group.get("/regional")
    assert resp.status_code == 200
    assert b"Regional View" in resp.data


def test_data_source_page(logged_in_with_group):
    resp = logged_in_with_group.get("/data")
    assert resp.status_code == 200


def test_cannot_switch_to_foreign_group(app, client):
    signup(client, email="owner@example.com")
    create_group(client, name="Owner's Group")

    with app.test_client() as other_client:
        signup(other_client, email="intruder@example.com")
        resp = other_client.post("/groups/switch/1", follow_redirects=False)
        assert resp.status_code == 403


def test_non_admin_cannot_upload_data(app, client):
    signup(client, email="owner@example.com")
    create_group(client, name="Shared Group")

    with app.app_context():
        from src.models import Group

        group = Group.query.filter_by(name="Shared Group").first()
        code = group.invite_code

    with app.test_client() as member_client:
        signup(member_client, email="member2@example.com")
        member_client.post("/groups/join", data={"invite_code": code}, follow_redirects=True)
        resp = member_client.post("/data/reset", follow_redirects=False)
        assert resp.status_code == 403


def test_forecasting_engine_holt_winters():
    from src.forecasting import fit_holt_winters
    import pandas as pd

    series = pd.Series([100, 120, 130, 150, 170, 190], index=pd.date_range("2026-01-01", periods=6, freq="MS"))
    forecast, resid = fit_holt_winters(series, 3)
    assert len(forecast) == 3
    assert len(resid) == len(series)
