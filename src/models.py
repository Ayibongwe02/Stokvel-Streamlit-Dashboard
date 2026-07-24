"""
Database models
================
SQLite-backed models (via Flask-SQLAlchemy) that replace the old flat
CSV files. Transactions and historical forecast rows are scoped by
`group_id` so each stokvel group's data is fully isolated.
"""

import secrets
import string
from datetime import datetime, timezone

from flask_login import UserMixin
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


def _utcnow():
    return datetime.now(timezone.utc)


def _generate_invite_code(length: int = 8) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=_utcnow)

    memberships = db.relationship(
        "GroupMembership", back_populates="user", cascade="all, delete-orphan"
    )

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def groups(self):
        return [m.group for m in self.memberships]

    def membership_for(self, group_id: int):
        for m in self.memberships:
            if m.group_id == group_id:
                return m
        return None

    def is_admin_of(self, group_id: int) -> bool:
        m = self.membership_for(group_id)
        return bool(m and m.role == "admin")


class Group(db.Model):
    __tablename__ = "groups"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    region = db.Column(db.String(120), nullable=True)
    invite_code = db.Column(db.String(16), unique=True, nullable=False, default=_generate_invite_code)
    created_at = db.Column(db.DateTime, default=_utcnow)

    memberships = db.relationship(
        "GroupMembership", back_populates="group", cascade="all, delete-orphan"
    )
    transactions = db.relationship(
        "Transaction", back_populates="group", cascade="all, delete-orphan"
    )
    historical_rows = db.relationship(
        "HistoricalForecast", back_populates="group", cascade="all, delete-orphan"
    )

    def regenerate_invite_code(self) -> str:
        self.invite_code = _generate_invite_code()
        return self.invite_code

    def member_count(self) -> int:
        return len(self.memberships)


class GroupMembership(db.Model):
    __tablename__ = "group_members"
    __table_args__ = (db.UniqueConstraint("user_id", "group_id", name="uq_user_group"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    group_id = db.Column(db.Integer, db.ForeignKey("groups.id"), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="member")  # 'admin' | 'member'
    joined_at = db.Column(db.DateTime, default=_utcnow)

    user = db.relationship("User", back_populates="memberships")
    group = db.relationship("Group", back_populates="memberships")


class Transaction(db.Model):
    """Replaces the old stokvel_dataset.csv, scoped per group."""

    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("groups.id"), nullable=False, index=True)
    member_id = db.Column(db.String(64), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False)
    contribution_amount = db.Column(db.Float, nullable=False, default=0.0)
    withdrawal_amount = db.Column(db.Float, nullable=False, default=0.0)
    balance = db.Column(db.Float, nullable=False)
    contribution_frequency = db.Column(db.String(40), nullable=True, default="Unknown")
    region = db.Column(db.String(120), nullable=True)
    category = db.Column(db.String(120), nullable=True)

    group = db.relationship("Group", back_populates="transactions")


class HistoricalForecast(db.Model):
    """Replaces the old forecasting_dashboard.csv, scoped per group."""

    __tablename__ = "historical_forecasts"

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey("groups.id"), nullable=False, index=True)
    member_id = db.Column(db.String(64), nullable=False, index=True)
    date = db.Column(db.Date, nullable=False)
    balance = db.Column(db.Float, nullable=True)
    forecast_balance = db.Column(db.Float, nullable=True)
    rmse_holt_winters = db.Column(db.Float, nullable=True)
    rmse_arima = db.Column(db.Float, nullable=True)
    mae = db.Column(db.Float, nullable=True)
    mape = db.Column(db.Float, nullable=True)
    region = db.Column(db.String(120), nullable=True, default="Unknown")
    member_category = db.Column(db.String(120), nullable=True, default="Unknown")
    forecast_horizon = db.Column(db.String(60), nullable=True, default="Unknown")

    group = db.relationship("Group", back_populates="historical_rows")
