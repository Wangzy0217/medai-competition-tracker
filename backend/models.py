from sqlalchemy.sql import func

from db import db


class Phase(db.Model):
    __tablename__ = "phases"

    id = db.Column(db.String(64), primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    date_range = db.Column(db.String(255), nullable=False)
    order_index = db.Column(db.Integer, nullable=False, default=0)

    main_tasks = db.relationship(
        "MainTask",
        backref="phase",
        cascade="all, delete-orphan",
        order_by="MainTask.order_index",
    )


class MainTask(db.Model):
    __tablename__ = "main_tasks"

    id = db.Column(db.String(64), primary_key=True)
    phase_id = db.Column(db.String(64), db.ForeignKey("phases.id"), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    date_range = db.Column(db.String(255), nullable=False)
    order_index = db.Column(db.Integer, nullable=False, default=0)

    sub_tasks = db.relationship(
        "SubTask",
        backref="main_task",
        cascade="all, delete-orphan",
        order_by="SubTask.order_index",
    )


class SubTask(db.Model):
    __tablename__ = "sub_tasks"

    id = db.Column(db.String(64), primary_key=True)
    main_task_id = db.Column(db.String(64), db.ForeignKey("main_tasks.id"), nullable=False)
    description = db.Column(db.Text, nullable=False)
    owner = db.Column(db.String(255), nullable=False)
    deadline = db.Column(db.String(64), nullable=False)
    status = db.Column(db.String(32), nullable=False)
    order_index = db.Column(db.Integer, nullable=False, default=0)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(32), unique=True, nullable=False)
    group_name = db.Column(db.String(100), nullable=False)
    role_title = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="user")
    created_at = db.Column(db.DateTime, server_default=func.now(), nullable=False)


class AuditLog(db.Model):
    __tablename__ = "audit_logs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    user_name = db.Column(db.String(100), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    details = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, server_default=func.now(), nullable=False)
