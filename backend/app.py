import os
from functools import wraps
from typing import Callable
from uuid import uuid4

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_migrate import Migrate
from flask_socketio import SocketIO
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

from db import db
from models import AuditLog, MainTask, Phase, SubTask, User
from seed import seed_if_empty
from serializers import get_full_data


def create_app():
    app = Flask(__name__)
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "change-me")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://ziyu:wangziyu@localhost:3306/medai_tracker",
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    CORS(app, supports_credentials=True)
    db.init_app(app)
    Migrate(app, db)
    socketio = SocketIO(app, cors_allowed_origins="*")

    valid_statuses = {"PENDING", "IN_PROGRESS", "WARNING", "COMPLETED", "RISK"}
    status_aliases = {
        "未开始": "PENDING",
        "进行中": "IN_PROGRESS",
        "即将逾期": "WARNING",
        "已完成": "COMPLETED",
        "已逾期": "RISK",
    }

    def normalize_status(value):
        if value is None:
            return None
        if isinstance(value, str):
            raw = value.strip()
            if raw in valid_statuses:
                return raw
            upper = raw.upper()
            if upper in valid_statuses:
                return upper
            if raw in status_aliases:
                return status_aliases[raw]
        return value
    token_serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"])

    with app.app_context():
        db.create_all()
        seed_if_empty()
        if not User.query.filter_by(phone="admin").first():
            admin_user = User(
                name="管理员",
                phone="admin",
                group_name="管理员",
                role_title="管理员",
                role="admin",
                password_hash=generate_password_hash("123456"),
            )
            db.session.add(admin_user)
            db.session.commit()

    def emit_update():
        socketio.emit("data:updated", get_full_data())

    def serialize_user(user: User):
        return {
            "id": user.id,
            "name": user.name,
            "phone": user.phone,
            "group": user.group_name,
            "roleTitle": user.role_title,
            "role": user.role,
        }

    def create_token(user: User):
        return token_serializer.dumps({"id": user.id})

    def get_current_user():
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None
        token = auth_header.replace("Bearer ", "").strip()
        try:
            data = token_serializer.loads(token, max_age=60 * 60 * 24 * 7)
        except (BadSignature, SignatureExpired):
            return None
        return User.query.get(data.get("id"))

    def require_auth(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({"error": "unauthorized"}), 401
            return fn(user, *args, **kwargs)
        return wrapper

    def require_admin(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user or user.role != "admin":
                return jsonify({"error": "forbidden"}), 403
            return fn(user, *args, **kwargs)
        return wrapper

    def require_admin_or_sub_admin(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user or user.role not in {"admin", "sub_admin"}:
                return jsonify({"error": "forbidden"}), 403
            return fn(user, *args, **kwargs)
        return wrapper

    def short_text(value: object | None, limit: int = 80) -> str:
        if value is None:
            return ""
        text = str(value)
        return text if len(text) <= limit else f"{text[:limit]}..."

    def display_value(value: object | None) -> str:
        if value is None:
            return "空"
        text = str(value).strip()
        if not text:
            return "空"
        return short_text(text)

    def status_text(value: object | None) -> str:
        if value is None:
            return "空"
        raw = str(value).strip()
        if not raw:
            return "空"
        upper = raw.upper()
        return STATUS_LABELS.get(upper, raw)

    def role_text(value: object | None) -> str:
        if value is None:
            return "空"
        raw = str(value).strip()
        if not raw:
            return "空"
        return ROLE_LABELS.get(raw, raw)

    def format_change(
        label: str,
        before: object | None,
        after: object | None,
        formatter: Callable[[object | None], str] | None = None,
    ) -> str | None:
        if before == after:
            return None
        fmt = formatter or display_value
        return f"{label}由{fmt(before)}改为{fmt(after)}"

    def task_context(sub_task: SubTask) -> str:
        main_task = sub_task.main_task
        phase = main_task.phase if main_task else None
        parts: list[str] = []
        if phase:
            parts.append(f"阶段【{short_text(phase.title)}】")
        if main_task:
            parts.append(f"分组【{short_text(main_task.title)}】")
        parts.append(f"任务【{short_text(sub_task.description)}】")
        return " ".join(parts)

    def can_mark_completed(user: User) -> bool:
        return user.role in {"admin", "sub_admin"}

    ACTION_LABELS = {
        "register": "注册",
        "login": "登录",
        "change_password": "修改密码",
        "admin_update_user": "更新用户",
        "create_phase": "新增阶段",
        "update_phase": "更新阶段",
        "delete_phase": "删除阶段",
        "create_group": "新增分组",
        "update_group": "更新分组",
        "delete_group": "删除分组",
        "create_task": "新增任务",
        "update_task": "更新任务",
        "delete_task": "删除任务",
        "reset_data": "重置数据",
    }

    STATUS_LABELS = {
        "PENDING": "未开始",
        "IN_PROGRESS": "进行中",
        "WARNING": "即将逾期",
        "COMPLETED": "已完成",
        "RISK": "已逾期",
    }

    ROLE_LABELS = {
        "admin": "管理员",
        "sub_admin": "子管理员",
        "user": "普通用户",
    }

    def log_action(user: User | None, action: str, details: str | None = None):
        log = AuditLog(
            user_id=user.id if user else None,
            user_name=user.name if user else "system",
            action=action,
            details=details,
        )
        db.session.add(log)
        db.session.commit()

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True})

    @app.post("/api/auth/register")
    def register():
        payload = request.get_json(force=True)
        name = payload.get("name")
        phone = payload.get("phone")
        group_name = payload.get("group")
        role_title = payload.get("roleTitle")
        password = payload.get("password")
        if not all([name, phone, group_name, role_title, password]):
            return jsonify({"error": "missing fields"}), 400
        if User.query.filter_by(phone=phone).first():
            return jsonify({"error": "phone already exists"}), 400
        user = User(
            name=name,
            phone=phone,
            group_name=group_name,
            role_title=role_title,
            role="user",
            password_hash=generate_password_hash(password),
        )
        db.session.add(user)
        db.session.commit()
        log_action(
            user,
            "register",
            f"注册账号：姓名【{short_text(name)}】，手机号【{phone}】，组别【{short_text(group_name)}】，职务【{short_text(role_title)}】",
        )
        return jsonify({"token": create_token(user), "user": serialize_user(user)})

    @app.post("/api/auth/login")
    def login():
        payload = request.get_json(force=True)
        phone = payload.get("phone")
        password = payload.get("password")
        if not phone or not password:
            return jsonify({"error": "phone and password are required"}), 400
        user = User.query.filter_by(phone=phone).first()
        if not user or not check_password_hash(user.password_hash, password):
            return jsonify({"error": "invalid credentials"}), 401
        log_action(user, "login", f"登录账号：手机号【{user.phone}】")
        return jsonify({"token": create_token(user), "user": serialize_user(user)})

    @app.post("/api/auth/change-password")
    @require_auth
    def change_password(user: User):
        payload = request.get_json(force=True)
        old_password = payload.get("oldPassword")
        new_password = payload.get("newPassword")
        if not old_password or not new_password:
            return jsonify({"error": "missing fields"}), 400
        if not check_password_hash(user.password_hash, old_password):
            return jsonify({"error": "invalid password"}), 400
        user.password_hash = generate_password_hash(new_password)
        db.session.commit()
        log_action(user, "change_password", "修改自己的密码")
        return jsonify({"ok": True})

    @app.get("/api/auth/me")
    @require_auth
    def me(user: User):
        return jsonify({"user": serialize_user(user)})

    @app.get("/api/admin/users")
    @require_admin
    def list_users(admin_user: User):
        users = User.query.order_by(User.created_at.desc()).all()
        return jsonify([serialize_user(u) for u in users])

    @app.patch("/api/admin/users/<int:user_id>")
    @require_admin
    def update_user(admin_user: User, user_id: int):
        payload = request.get_json(force=True)
        user = User.query.get_or_404(user_id)
        before = {
            "name": user.name,
            "phone": user.phone,
            "group_name": user.group_name,
            "role_title": user.role_title,
            "role": user.role,
        }
        if "name" in payload:
            user.name = payload["name"]
        if "phone" in payload:
            user.phone = payload["phone"]
        if "group" in payload:
            user.group_name = payload["group"]
        if "roleTitle" in payload:
            user.role_title = payload["roleTitle"]
        if "role" in payload:
            user.role = payload["role"]
        if "password" in payload and payload["password"]:
            user.password_hash = generate_password_hash(payload["password"])
        db.session.commit()
        changes = [
            format_change("姓名", before["name"], user.name),
            format_change("手机号", before["phone"], user.phone),
            format_change("组别", before["group_name"], user.group_name),
            format_change("职务", before["role_title"], user.role_title),
            format_change("角色", before["role"], user.role, role_text),
        ]
        if "password" in payload and payload["password"]:
            changes.append("重置密码")
        detail = "；".join([c for c in changes if c]) or "无变更"
        log_action(
            admin_user,
            "admin_update_user",
            f"更新用户【{short_text(user.name)} / {user.phone}】：{detail}",
        )
        return jsonify({"ok": True})

    @app.get("/api/admin/logs")
    @require_admin_or_sub_admin
    def list_logs(admin_user: User):
        logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(200).all()
        return jsonify([
            {
                "id": l.id,
                "userName": l.user_name,
                "action": l.action,
                "actionLabel": ACTION_LABELS.get(l.action, l.action),
                "details": l.details,
                "createdAt": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ])

    @app.get("/api/phases")
    @require_auth
    def list_phases(user: User):
        return jsonify(get_full_data())

    @app.post("/api/phases")
    @require_auth
    def create_phase(user: User):
        payload = request.get_json(force=True)
        title = payload.get("title")
        date_range = payload.get("dateRange")
        if not title or not date_range:
            return jsonify({"error": "title and dateRange are required"}), 400
        order_index = payload.get("orderIndex", Phase.query.count())
        phase = Phase(
            id=payload.get("id") or f"phase-{uuid4().hex[:8]}",
            title=title,
            date_range=date_range,
            order_index=order_index,
        )
        db.session.add(phase)
        db.session.commit()
        log_action(
            user,
            "create_phase",
            f"新增阶段【{short_text(phase.title)}】，时间【{phase.date_range}】",
        )
        emit_update()
        return jsonify({"id": phase.id})

    @app.patch("/api/phases/<phase_id>")
    @require_auth
    def update_phase(user: User, phase_id):
        payload = request.get_json(force=True)
        phase = Phase.query.get_or_404(phase_id)
        before = {
            "title": phase.title,
            "date_range": phase.date_range,
            "order_index": phase.order_index,
        }
        if "title" in payload:
            phase.title = payload["title"]
        if "dateRange" in payload:
            phase.date_range = payload["dateRange"]
        if "orderIndex" in payload:
            phase.order_index = payload["orderIndex"]
        db.session.commit()
        changes = [
            format_change("标题", before["title"], phase.title),
            format_change("时间", before["date_range"], phase.date_range),
            format_change("顺序", before["order_index"], phase.order_index),
        ]
        detail = "；".join([c for c in changes if c]) or "无变更"
        log_action(
            user,
            "update_phase",
            f"更新阶段【{short_text(phase.title)}】：{detail}",
        )
        emit_update()
        return jsonify({"ok": True})

    @app.delete("/api/phases/<phase_id>")
    @require_auth
    def delete_phase(user: User, phase_id):
        phase = Phase.query.get_or_404(phase_id)
        detail = f"删除阶段【{short_text(phase.title)}】，时间【{phase.date_range}】"
        db.session.delete(phase)
        db.session.commit()
        log_action(user, "delete_phase", detail)
        emit_update()
        return jsonify({"ok": True})

    @app.post("/api/main-tasks")
    @require_auth
    def create_main_task(user: User):
        payload = request.get_json(force=True)
        phase_id = payload.get("phaseId")
        title = payload.get("title")
        date_range = payload.get("dateRange")
        if not phase_id or not title or not date_range:
            return jsonify({"error": "phaseId, title, dateRange are required"}), 400
        order_index = payload.get(
            "orderIndex", MainTask.query.filter_by(phase_id=phase_id).count()
        )
        main_task = MainTask(
            id=payload.get("id") or f"mt-{uuid4().hex[:8]}",
            phase_id=phase_id,
            title=title,
            date_range=date_range,
            order_index=order_index,
        )
        db.session.add(main_task)
        db.session.commit()
        phase = Phase.query.get(phase_id)
        log_action(
            user,
            "create_group",
            (
                f"新增分组【{short_text(main_task.title)}】"
                f"{f'（阶段【{short_text(phase.title)}】）' if phase else ''}，时间【{main_task.date_range}】"
            ),
        )
        emit_update()
        return jsonify({"id": main_task.id})

    @app.patch("/api/main-tasks/<main_task_id>")
    @require_auth
    def update_main_task(user: User, main_task_id):
        payload = request.get_json(force=True)
        main_task = MainTask.query.get_or_404(main_task_id)
        before = {
            "title": main_task.title,
            "date_range": main_task.date_range,
            "phase_id": main_task.phase_id,
            "order_index": main_task.order_index,
        }
        if "title" in payload:
            main_task.title = payload["title"]
        if "dateRange" in payload:
            main_task.date_range = payload["dateRange"]
        if "phaseId" in payload:
            main_task.phase_id = payload["phaseId"]
        if "orderIndex" in payload:
            main_task.order_index = payload["orderIndex"]
        db.session.commit()
        before_phase = Phase.query.get(before["phase_id"]) if before["phase_id"] else None
        after_phase = Phase.query.get(main_task.phase_id) if main_task.phase_id else None
        changes = [
            format_change("标题", before["title"], main_task.title),
            format_change("时间", before["date_range"], main_task.date_range),
            format_change(
                "阶段",
                before_phase.title if before_phase else None,
                after_phase.title if after_phase else None,
            ),
            format_change("顺序", before["order_index"], main_task.order_index),
        ]
        detail = "；".join([c for c in changes if c]) or "无变更"
        log_action(
            user,
            "update_group",
            (
                f"更新分组【{short_text(main_task.title)}】"
                f"{f'（阶段【{short_text(after_phase.title)}】）' if after_phase else ''}：{detail}"
            ),
        )
        emit_update()
        return jsonify({"ok": True})

    @app.delete("/api/main-tasks/<main_task_id>")
    @require_auth
    def delete_main_task(user: User, main_task_id):
        main_task = MainTask.query.get_or_404(main_task_id)
        phase = Phase.query.get(main_task.phase_id)
        detail = (
            f"删除分组【{short_text(main_task.title)}】"
            f"{f'（阶段【{short_text(phase.title)}】）' if phase else ''}，时间【{main_task.date_range}】"
        )
        db.session.delete(main_task)
        db.session.commit()
        log_action(user, "delete_group", detail)
        emit_update()
        return jsonify({"ok": True})

    @app.post("/api/sub-tasks")
    @require_auth
    def create_sub_task(user: User):
        payload = request.get_json(force=True)
        main_task_id = payload.get("mainTaskId")
        description = payload.get("description")
        owner = payload.get("owner")
        deadline = payload.get("deadline")
        status = normalize_status(payload.get("status", "PENDING"))
        if status not in valid_statuses:
            return jsonify({"error": "invalid status", "received": status}), 400
        if status == "COMPLETED" and not can_mark_completed(user):
            return jsonify({"error": "forbidden"}), 403
        if not main_task_id or not description or not owner or not deadline:
            return jsonify({"error": "mainTaskId, description, owner, deadline are required"}), 400
        order_index = payload.get(
            "orderIndex", SubTask.query.filter_by(main_task_id=main_task_id).count()
        )
        sub_task = SubTask(
            id=payload.get("id") or f"st-{uuid4().hex[:8]}",
            main_task_id=main_task_id,
            description=description,
            owner=owner,
            deadline=deadline,
            status=status,
            order_index=order_index,
        )
        db.session.add(sub_task)
        db.session.commit()
        log_action(
            user,
            "create_task",
            (
                f"新增任务：{task_context(sub_task)}，"
                f"责任【{short_text(owner)}】，截止【{deadline}】，状态【{status_text(status)}】"
            ),
        )
        emit_update()
        return jsonify({"id": sub_task.id})

    @app.patch("/api/sub-tasks/<sub_task_id>")
    @require_auth
    def update_sub_task(user: User, sub_task_id):
        payload = request.get_json(force=True)
        sub_task = SubTask.query.get_or_404(sub_task_id)
        before = {
            "description": sub_task.description,
            "owner": sub_task.owner,
            "deadline": sub_task.deadline,
            "status": sub_task.status,
            "order_index": sub_task.order_index,
        }
        if "description" in payload:
            sub_task.description = payload["description"]
        if "owner" in payload:
            sub_task.owner = payload["owner"]
        if "deadline" in payload:
            sub_task.deadline = payload["deadline"]
        if "status" in payload:
            status = normalize_status(payload["status"])
            if status not in valid_statuses:
                return jsonify({"error": "invalid status", "received": status}), 400
            if status == "COMPLETED" and not can_mark_completed(user):
                return jsonify({"error": "forbidden"}), 403
            sub_task.status = status
        if "orderIndex" in payload:
            sub_task.order_index = payload["orderIndex"]
        db.session.commit()
        changes = [
            format_change("描述", before["description"], sub_task.description),
            format_change("责任", before["owner"], sub_task.owner),
            format_change("截止", before["deadline"], sub_task.deadline),
            format_change("状态", before["status"], sub_task.status, status_text),
            format_change("顺序", before["order_index"], sub_task.order_index),
        ]
        detail = "；".join([c for c in changes if c]) or "无变更"
        log_action(
            user,
            "update_task",
            f"更新任务：{task_context(sub_task)}；{detail}",
        )
        emit_update()
        return jsonify({"ok": True})

    @app.delete("/api/sub-tasks/<sub_task_id>")
    @require_auth
    def delete_sub_task(user: User, sub_task_id):
        sub_task = SubTask.query.get_or_404(sub_task_id)
        detail = (
            f"删除任务：{task_context(sub_task)}，"
            f"责任【{short_text(sub_task.owner)}】，"
            f"截止【{sub_task.deadline}】，"
            f"状态【{status_text(sub_task.status)}】"
        )
        db.session.delete(sub_task)
        db.session.commit()
        log_action(user, "delete_task", detail)
        emit_update()
        return jsonify({"ok": True})

    @app.post("/api/reset")
    @require_admin
    def reset_all(admin_user: User):
        SubTask.query.delete()
        MainTask.query.delete()
        Phase.query.delete()
        db.session.commit()
        seed_if_empty()
        log_action(admin_user, "reset_data", "重置所有阶段/分组/任务数据")
        emit_update()
        return jsonify({"ok": True})

    return app, socketio
