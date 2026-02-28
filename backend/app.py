import os
import re
import subprocess
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Callable
from uuid import uuid4

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_migrate import Migrate
from flask_socketio import SocketIO
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import inspect, text
from werkzeug.security import check_password_hash, generate_password_hash

from db import db
from models import (
    AuditLog,
    FeatureRequest,
    FeatureRequestReply,
    MainTask,
    Phase,
    PlatformUpdateLog,
    SubTask,
    User,
)
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

    valid_statuses = {"PENDING", "IN_PROGRESS", "WARNING", "REVIEWING", "COMPLETED", "RISK"}
    manual_statuses = {"PENDING", "IN_PROGRESS", "COMPLETED"}
    logic_statuses = {"WARNING", "RISK", "REVIEWING"}
    status_aliases = {
        "未开始": "PENDING",
        "进行中": "IN_PROGRESS",
        "即将逾期": "WARNING",
        "审核中": "REVIEWING",
        "已完成": "COMPLETED",
        "已逾期": "RISK",
    }
    feature_request_statuses = {
        "PENDING": "待响应",
        "NEEDS_CHANGE": "需修改",
        "NO_CHANGE": "无需修改",
        "RESPONDED": "已回复",
        "PLANNED": "已纳入计划",
        "DONE": "已完成",
        "REJECTED": "暂不采纳",
    }

    def resolve_release_key() -> str:
        stamp = datetime.now().strftime("%Y%m%d%H%M%S")
        env_candidates = [
            os.getenv("APP_RELEASE_VERSION"),
            os.getenv("RELEASE_VERSION"),
            os.getenv("DEPLOY_ID"),
            os.getenv("GIT_COMMIT"),
        ]
        for value in env_candidates:
            if value and value.strip():
                return f"env-{value.strip()[:80]}-{stamp}"

        try:
            repo_root = Path(__file__).resolve().parents[1]
            result = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=repo_root,
                capture_output=True,
                text=True,
                check=False,
                timeout=1.5,
            )
            commit = (result.stdout or "").strip()
            if result.returncode == 0 and commit:
                return f"git-{commit}-{stamp}"
        except Exception:
            pass

        return f"startup-{stamp}"

    def build_auto_release_note(release_key: str):
        now_text = datetime.now().strftime("%Y-%m-%d %H:%M")
        title = f"平台升级发布 {now_text}"
        lines = [
            f"发布标识：{release_key}",
            "本次升级功能变化：",
            "1. 新增“功能需求提报”模块，所有用户可提交需求标题与详细描述。",
            "2. 新增“需求响应机制”，总管理员可对每条需求进行状态响应并给出回复。",
            "3. 新增“平台更新日志”模块，每次部署后自动生成升级说明并对全员可见。",
            "4. 持续保留任务进度、审核流与操作日志能力，保障过程可追溯。",
            "说明：本日志由系统在部署启动时自动生成。",
        ]
        return title, "\n".join(lines)

    def ensure_platform_release_log():
        release_key = resolve_release_key()
        existed = PlatformUpdateLog.query.filter_by(release_key=release_key).first()
        if existed:
            return existed
        title, content = build_auto_release_note(release_key)
        entry = PlatformUpdateLog(
            release_key=release_key,
            title=title,
            content=content,
            generated_by="system",
        )
        db.session.add(entry)
        db.session.commit()
        return entry

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

    def normalize_task_id(value):
        if value is None:
            return None
        text_value = str(value).strip()
        return text_value or None

    token_serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"])

    with app.app_context():
        db.create_all()
        inspector = inspect(db.engine)
        sub_task_columns = {column["name"] for column in inspector.get_columns("sub_tasks")}
        if "predecessor_id" not in sub_task_columns:
            db.session.execute(text("ALTER TABLE sub_tasks ADD COLUMN predecessor_id VARCHAR(64) NULL"))
            db.session.commit()
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
        ensure_platform_release_log()

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

    def feature_request_status_text(value: str | None):
        if not value:
            return "待响应"
        upper = value.strip().upper()
        return feature_request_statuses.get(upper, upper)

    def serialize_feature_reply(reply: FeatureRequestReply):
        return {
            "id": reply.id,
            "responderId": reply.responder_id,
            "responderName": reply.responder_name,
            "message": reply.message,
            "createdAt": reply.created_at.isoformat() if reply.created_at else "",
        }

    def serialize_feature_request(item: FeatureRequest):
        replies = [serialize_feature_reply(reply) for reply in item.replies]
        return {
            "id": item.id,
            "title": item.title,
            "description": item.description,
            "status": item.status,
            "statusLabel": feature_request_status_text(item.status),
            "userId": item.user_id,
            "userName": item.user_name,
            "userGroup": item.user_group,
            "createdAt": item.created_at.isoformat() if item.created_at else "",
            "updatedAt": item.updated_at.isoformat() if item.updated_at else "",
            "replyCount": len(replies),
            "latestReplyAt": replies[-1]["createdAt"] if replies else "",
            "replies": replies,
        }

    def serialize_platform_update(item: PlatformUpdateLog):
        return {
            "id": item.id,
            "releaseKey": item.release_key,
            "title": item.title,
            "content": item.content,
            "generatedBy": item.generated_by,
            "createdAt": item.created_at.isoformat() if item.created_at else "",
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

    def predecessor_text(value: object | None) -> str:
        predecessor_id = normalize_task_id(value)
        if not predecessor_id:
            return "无"
        predecessor = SubTask.query.get(predecessor_id)
        if not predecessor:
            return f"任务已不存在（{predecessor_id}）"
        return short_text(predecessor.description, limit=60)

    def would_create_predecessor_cycle(current_task_id: str, predecessor_id: str | None) -> bool:
        cursor_id = predecessor_id
        visited: set[str] = set()
        while cursor_id:
            if cursor_id == current_task_id:
                return True
            if cursor_id in visited:
                return False
            visited.add(cursor_id)
            cursor_task = SubTask.query.get(cursor_id)
            if not cursor_task:
                return False
            cursor_id = normalize_task_id(cursor_task.predecessor_id)
        return False

    def completion_block_reason(sub_task: SubTask) -> str | None:
        predecessor_id = normalize_task_id(sub_task.predecessor_id)
        if not predecessor_id:
            return None
        predecessor = SubTask.query.get(predecessor_id)
        if not predecessor:
            return "前置任务不存在，请先重新设置前置任务"
        if predecessor.status != "COMPLETED":
            return (
                f"前置任务【{short_text(predecessor.description, limit=40)}】"
                f"当前状态为【{status_text(predecessor.status)}】，未完成前无法完成本任务"
            )
        return None

    def predecessor_downgrade_block_reason(sub_task: SubTask, next_status: str) -> str | None:
        if next_status == "COMPLETED":
            return None
        blocking_task = (
            SubTask.query.filter(
                SubTask.predecessor_id == sub_task.id,
                SubTask.status.in_(["COMPLETED", "REVIEWING"]),
            )
            .order_by(SubTask.order_index.asc())
            .first()
        )
        if not blocking_task:
            return None
        return (
            f"任务【{short_text(blocking_task.description, limit=40)}】依赖当前任务且状态为"
            f"【{status_text(blocking_task.status)}】；请先调整依赖任务状态或解除前置关系"
        )

    def can_mark_completed(user: User) -> bool:
        return user.role in {"admin", "sub_admin"}

    def find_latest_review_request_log(sub_task_id: str):
        return (
            AuditLog.query.filter(
                AuditLog.action == "submit_completion_review",
                AuditLog.details.isnot(None),
                AuditLog.details.like(f"%[sub_task_id:{sub_task_id}]%"),
            )
            .order_by(AuditLog.id.desc())
            .first()
        )

    def extract_review_from_status(detail: str | None):
        if not detail:
            return None
        matched = re.search(r"\[review_from:([A-Z_]+)\]", detail)
        if not matched:
            return None
        return matched.group(1)

    def extract_sub_task_id(detail: str | None):
        if not detail:
            return None
        matched = re.search(r"\[sub_task_id:([^\]]+)\]", detail)
        if not matched:
            return None
        value = matched.group(1).strip()
        return value or None

    def extract_applicant_user_id(detail: str | None):
        if not detail:
            return None
        matched = re.search(r"\[applicant_user_id:(\d+)\]", detail)
        if not matched:
            return None
        try:
            return int(matched.group(1))
        except (TypeError, ValueError):
            return None

    def extract_task_description(detail: str | None):
        if not detail:
            return None
        matched = re.search(r"任务【([^】]+)】", detail)
        if not matched:
            return None
        value = matched.group(1).strip()
        return value or None

    def find_review_request_log_before(sub_task_id: str, before_log_id: int):
        return (
            AuditLog.query.filter(
                AuditLog.action == "submit_completion_review",
                AuditLog.details.isnot(None),
                AuditLog.details.like(f"%[sub_task_id:{sub_task_id}]%"),
                AuditLog.id < before_log_id,
            )
            .order_by(AuditLog.id.desc())
            .first()
        )

    def get_review_request_meta(sub_task: SubTask):
        review_log = find_latest_review_request_log(sub_task.id)
        applicant = User.query.get(review_log.user_id) if review_log and review_log.user_id else None
        review_from_status = extract_review_from_status(review_log.details if review_log else None)
        return {
            "review_log": review_log,
            "applicant": applicant,
            "applicant_name": (applicant.name if applicant else (review_log.user_name if review_log else "未知用户")),
            "applicant_group": (applicant.group_name if applicant else ""),
            "review_from_status": review_from_status if review_from_status in valid_statuses else "IN_PROGRESS",
        }

    def can_review_request(reviewer: User, applicant_group: str) -> bool:
        if reviewer.role == "admin":
            return True
        if reviewer.role == "sub_admin":
            return bool(applicant_group) and reviewer.group_name == applicant_group
        return False

    ACTION_LABELS = {
        "register": "注册",
        "login": "登录",
        "change_password": "修改密码",
        "admin_create_user": "新增用户",
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
        "submit_completion_review": "提交完成审核",
        "withdraw_completion_review": "撤回完成审核",
        "approve_completion_review": "审核通过",
        "reject_completion_review": "审核驳回",
        "submit_feature_request": "提交功能需求",
        "reply_feature_request": "回复功能需求",
        "mark_feature_request_status": "标注需求状态",
        "reset_data": "重置数据",
    }

    STATUS_LABELS = {
        "PENDING": "未开始",
        "IN_PROGRESS": "进行中",
        "WARNING": "即将逾期",
        "REVIEWING": "审核中",
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

    @app.post("/api/admin/users")
    @require_admin
    def create_user(admin_user: User):
        payload = request.get_json(force=True) or {}
        name = (payload.get("name") or "").strip()
        phone = (payload.get("phone") or "").strip()
        group_name = (payload.get("group") or "").strip()
        role_title = (payload.get("roleTitle") or "").strip()
        role = (payload.get("role") or "user").strip()
        password = payload.get("password") or "123456"

        if not all([name, phone, group_name, role_title]):
            return jsonify({"error": "missing fields"}), 400
        if role not in ROLE_LABELS:
            return jsonify({"error": "invalid role"}), 400
        if User.query.filter_by(phone=phone).first():
            return jsonify({"error": "phone already exists"}), 400

        user = User(
            name=name,
            phone=phone,
            group_name=group_name,
            role_title=role_title,
            role=role,
            password_hash=generate_password_hash(password),
        )
        db.session.add(user)
        db.session.commit()

        log_action(
            admin_user,
            "admin_create_user",
            (
                f"新增用户【{short_text(name)} / {phone}】："
                f"组别【{short_text(group_name)}】，"
                f"职务【{short_text(role_title)}】，"
                f"角色【{role_text(role)}】，"
                f"初始密码【{'默认123456' if not payload.get('password') else '已自定义'}】"
            ),
        )
        return jsonify({"ok": True, "id": user.id})

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

    @app.get("/api/feature-requests")
    @require_auth
    def list_feature_requests(user: User):
        query = FeatureRequest.query
        requested_status = (request.args.get("status") or "").strip().upper()
        if requested_status and requested_status in feature_request_statuses:
            query = query.filter(FeatureRequest.status == requested_status)
        if user.role != "admin":
            query = query.filter(FeatureRequest.user_id == user.id)
        requests = (
            query.order_by(FeatureRequest.updated_at.desc(), FeatureRequest.id.desc())
            .limit(300)
            .all()
        )
        return jsonify([serialize_feature_request(item) for item in requests])

    @app.post("/api/feature-requests")
    @require_auth
    def create_feature_request(user: User):
        payload = request.get_json(force=True) or {}
        title = (payload.get("title") or "").strip()
        description = (payload.get("description") or "").strip()
        if not title or not description:
            return jsonify({"error": "title and description are required"}), 400
        if len(title) > 200:
            return jsonify({"error": "title is too long"}), 400

        feature_request = FeatureRequest(
            user_id=user.id,
            user_name=user.name,
            user_group=user.group_name,
            title=title,
            description=description,
            status="PENDING",
        )
        db.session.add(feature_request)
        db.session.commit()
        log_action(
            user,
            "submit_feature_request",
            f"提交功能需求【{short_text(title, limit=80)}】",
        )
        return jsonify({"id": feature_request.id})

    @app.post("/api/feature-requests/<int:feature_request_id>/reply")
    @require_admin
    def reply_feature_request(admin_user: User, feature_request_id: int):
        payload = request.get_json(force=True) or {}
        message = (payload.get("message") or "").strip()
        status = str(payload.get("status") or "RESPONDED").strip().upper()
        if not message:
            return jsonify({"error": "message is required"}), 400
        if status not in feature_request_statuses:
            return jsonify({"error": "invalid status"}), 400

        feature_request = FeatureRequest.query.get_or_404(feature_request_id)
        reply = FeatureRequestReply(
            feature_request_id=feature_request.id,
            responder_id=admin_user.id,
            responder_name=admin_user.name,
            message=message,
        )
        feature_request.status = status
        db.session.add(reply)
        db.session.commit()
        log_action(
            admin_user,
            "reply_feature_request",
            (
                f"回复功能需求#{feature_request.id}【{short_text(feature_request.title, limit=50)}】；"
                f"状态【{feature_request_status_text(status)}】；"
                f"内容【{short_text(message, limit=80)}】"
            ),
        )
        return jsonify({"ok": True})

    @app.patch("/api/feature-requests/<int:feature_request_id>/status")
    @require_admin
    def mark_feature_request_status(admin_user: User, feature_request_id: int):
        payload = request.get_json(force=True) or {}
        status = str(payload.get("status") or "").strip().upper()
        if status not in feature_request_statuses:
            return jsonify({"error": "invalid status"}), 400

        feature_request = FeatureRequest.query.get_or_404(feature_request_id)
        before_status = feature_request.status
        feature_request.status = status
        db.session.commit()

        log_action(
            admin_user,
            "mark_feature_request_status",
            (
                f"标注功能需求#{feature_request.id}【{short_text(feature_request.title, limit=50)}】："
                f"由【{feature_request_status_text(before_status)}】改为【{feature_request_status_text(status)}】"
            ),
        )
        return jsonify({"ok": True})

    @app.get("/api/platform-updates")
    @require_auth
    def list_platform_updates(user: User):
        limit_arg = (request.args.get("limit") or "").strip()
        try:
            limit = int(limit_arg) if limit_arg else 30
        except ValueError:
            limit = 30
        limit = max(1, min(100, limit))
        updates = (
            PlatformUpdateLog.query.order_by(PlatformUpdateLog.created_at.desc())
            .limit(limit)
            .all()
        )
        return jsonify([serialize_platform_update(item) for item in updates])

    @app.get("/api/phases")
    @require_auth
    def list_phases(user: User):
        data = get_full_data()
        withdrawable_ids: set[str] = set()
        if user.role == "user":
            reviewing_sub_task_ids = [
                st.id for st in SubTask.query.with_entities(SubTask.id).filter_by(status="REVIEWING").all()
            ]
            for sub_task_id in reviewing_sub_task_ids:
                review_log = find_latest_review_request_log(sub_task_id)
                if review_log and review_log.user_id == user.id:
                    withdrawable_ids.add(sub_task_id)

        for phase in data:
            for main_task in phase.get("mainTasks", []):
                for sub_task in main_task.get("subTasks", []):
                    sub_task_id = sub_task.get("id")
                    sub_task["canWithdrawReview"] = (
                        bool(sub_task_id)
                        and sub_task.get("status") == "REVIEWING"
                        and sub_task_id in withdrawable_ids
                    )

        return jsonify(data)

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
        sub_task_ids = [row.id for row in SubTask.query.with_entities(SubTask.id).filter_by(main_task_id=main_task_id).all()]
        if sub_task_ids:
            SubTask.query.filter(SubTask.predecessor_id.in_(sub_task_ids)).update(
                {SubTask.predecessor_id: None},
                synchronize_session=False,
            )
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
        predecessor_id = normalize_task_id(payload.get("predecessorId"))
        status = normalize_status(payload.get("status", "PENDING"))
        if status not in valid_statuses:
            return jsonify({"error": "invalid status", "received": status}), 400
        if status in logic_statuses:
            return jsonify({"error": "status is system managed", "received": status}), 400
        if status == "COMPLETED" and not can_mark_completed(user):
            return jsonify({"error": "forbidden"}), 403
        if not main_task_id or not description or not owner or not deadline:
            return jsonify({"error": "mainTaskId, description, owner, deadline are required"}), 400
        sub_task_id = payload.get("id") or f"st-{uuid4().hex[:8]}"
        if predecessor_id:
            predecessor = SubTask.query.get(predecessor_id)
            if not predecessor:
                return jsonify({"error": "invalid predecessorId"}), 400
            if predecessor_id == sub_task_id:
                return jsonify({"error": "predecessor cannot be self"}), 400
            if would_create_predecessor_cycle(sub_task_id, predecessor_id):
                return jsonify({"error": "predecessor cycle detected"}), 400
        order_index = payload.get(
            "orderIndex", SubTask.query.filter_by(main_task_id=main_task_id).count()
        )
        sub_task = SubTask(
            id=sub_task_id,
            main_task_id=main_task_id,
            predecessor_id=predecessor_id,
            description=description,
            owner=owner,
            deadline=deadline,
            status=status,
            order_index=order_index,
        )
        block_reason = completion_block_reason(sub_task) if status == "COMPLETED" else None
        if block_reason:
            return jsonify({"error": block_reason}), 400
        db.session.add(sub_task)
        db.session.commit()
        log_action(
            user,
            "create_task",
            (
                f"新增任务：{task_context(sub_task)}，"
                f"责任【{short_text(owner)}】，截止【{deadline}】，状态【{status_text(status)}】"
                f"，前置任务【{predecessor_text(sub_task.predecessor_id)}】"
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
            "predecessor_id": sub_task.predecessor_id,
        }
        if "description" in payload:
            sub_task.description = payload["description"]
        if "owner" in payload:
            sub_task.owner = payload["owner"]
        if "deadline" in payload:
            sub_task.deadline = payload["deadline"]
        if "predecessorId" in payload:
            predecessor_id = normalize_task_id(payload.get("predecessorId"))
            if predecessor_id:
                predecessor = SubTask.query.get(predecessor_id)
                if not predecessor:
                    return jsonify({"error": "invalid predecessorId"}), 400
                if predecessor_id == sub_task.id:
                    return jsonify({"error": "predecessor cannot be self"}), 400
                if would_create_predecessor_cycle(sub_task.id, predecessor_id):
                    return jsonify({"error": "predecessor cycle detected"}), 400
            sub_task.predecessor_id = predecessor_id
        if "status" in payload:
            status = normalize_status(payload["status"])
            if status not in valid_statuses:
                return jsonify({"error": "invalid status", "received": status}), 400
            if status in {"WARNING", "RISK"}:
                return jsonify({"error": "status is system managed", "received": status}), 400
            if before["status"] == "REVIEWING" and status != "REVIEWING":
                return jsonify({"error": "use review workflow endpoint"}), 403
            if status == "REVIEWING":
                if user.role != "user":
                    return jsonify({"error": "use review workflow endpoint"}), 403
                if not payload.get("submitReview"):
                    return jsonify({"error": "submitReview flag required"}), 403
            if status not in manual_statuses and status != "REVIEWING":
                return jsonify({"error": "invalid status", "received": status}), 400
            if status == "COMPLETED" and not can_mark_completed(user):
                return jsonify({"error": "forbidden"}), 403
            if status != before["status"]:
                reverse_block_reason = predecessor_downgrade_block_reason(sub_task, status)
                if reverse_block_reason:
                    return jsonify({"error": reverse_block_reason}), 400
            if status in {"COMPLETED", "REVIEWING"}:
                block_reason = completion_block_reason(sub_task)
                if block_reason:
                    return jsonify({"error": block_reason}), 400
            sub_task.status = status
        if sub_task.status in {"COMPLETED", "REVIEWING"}:
            block_reason = completion_block_reason(sub_task)
            if block_reason:
                return jsonify({"error": block_reason}), 400
        if "orderIndex" in payload:
            sub_task.order_index = payload["orderIndex"]
        db.session.commit()
        changes = [
            format_change("描述", before["description"], sub_task.description),
            format_change("责任", before["owner"], sub_task.owner),
            format_change("截止", before["deadline"], sub_task.deadline),
            format_change("状态", before["status"], sub_task.status, status_text),
            format_change("顺序", before["order_index"], sub_task.order_index),
            format_change("前置任务", before["predecessor_id"], sub_task.predecessor_id, predecessor_text),
        ]
        detail = "；".join([c for c in changes if c]) or "无变更"
        if before["status"] != sub_task.status and sub_task.status == "REVIEWING":
            log_action(
                user,
                "submit_completion_review",
                (
                    f"提交完成审核：{task_context(sub_task)}；"
                    f"[sub_task_id:{sub_task.id}]"
                    f"[review_from:{before['status']}]"
                ),
            )
        log_action(
            user,
            "update_task",
            f"更新任务：{task_context(sub_task)}；{detail}",
        )
        emit_update()
        return jsonify({"ok": True})

    @app.post("/api/sub-tasks/<sub_task_id>/withdraw-review")
    @require_auth
    def withdraw_sub_task_review(user: User, sub_task_id):
        sub_task = SubTask.query.get_or_404(sub_task_id)
        if user.role != "user":
            return jsonify({"error": "forbidden"}), 403
        if sub_task.status != "REVIEWING":
            return jsonify({"error": "task is not under review"}), 400

        review_log = find_latest_review_request_log(sub_task.id)
        if not review_log or review_log.user_id != user.id:
            return jsonify({"error": "only applicant can withdraw"}), 403

        original_status = extract_review_from_status(review_log.details)
        if original_status not in {"PENDING", "IN_PROGRESS"}:
            original_status = "IN_PROGRESS"
        reverse_block_reason = predecessor_downgrade_block_reason(sub_task, original_status)
        if reverse_block_reason:
            return jsonify({"error": reverse_block_reason}), 400

        sub_task.status = original_status
        db.session.commit()
        log_action(
            user,
            "withdraw_completion_review",
            (
                f"撤回完成审核：{task_context(sub_task)}；"
                f"[sub_task_id:{sub_task.id}]；"
                f"恢复状态【{status_text(original_status)}】"
            ),
        )
        emit_update()
        return jsonify({"ok": True, "status": original_status})

    @app.get("/api/reviews/pending")
    @require_auth
    def list_pending_reviews(user: User):
        if user.role not in {"admin", "sub_admin"}:
            return jsonify({"error": "forbidden"}), 403

        pending_reviews = []
        sub_tasks = (
            SubTask.query.filter_by(status="REVIEWING")
            .order_by(SubTask.main_task_id.asc(), SubTask.order_index.asc())
            .all()
        )
        for sub_task in sub_tasks:
            main_task = sub_task.main_task
            phase = main_task.phase if main_task else None
            review_meta = get_review_request_meta(sub_task)
            applicant_group = review_meta["applicant_group"]

            if user.role == "sub_admin" and not can_review_request(user, applicant_group):
                continue

            review_log = review_meta["review_log"]
            review_from_status = review_meta["review_from_status"]
            pending_reviews.append(
                {
                    "subTaskId": sub_task.id,
                    "phaseTitle": phase.title if phase else "",
                    "mainTaskTitle": main_task.title if main_task else "",
                    "description": sub_task.description,
                    "owner": sub_task.owner,
                    "deadline": sub_task.deadline,
                    "status": sub_task.status,
                    "reviewFromStatus": review_from_status,
                    "reviewFromLabel": status_text(review_from_status),
                    "applicantName": review_meta["applicant_name"],
                    "applicantGroup": applicant_group,
                    "requestedAt": review_log.created_at.isoformat() if review_log and review_log.created_at else "",
                }
            )
        return jsonify(pending_reviews)

    @app.get("/api/reviews/my-results")
    @require_auth
    def list_my_review_results(user: User):
        if user.role != "user":
            return jsonify([])

        decision_logs = (
            AuditLog.query.filter(
                AuditLog.action.in_(["approve_completion_review", "reject_completion_review"])
            )
            .order_by(AuditLog.id.desc())
            .limit(500)
            .all()
        )

        results = []
        for log in decision_logs:
            details = log.details or ""
            sub_task_id = extract_sub_task_id(details)
            if not sub_task_id:
                task_description = extract_task_description(details)
                if task_description:
                    request_log = (
                        AuditLog.query.filter(
                            AuditLog.action == "submit_completion_review",
                            AuditLog.user_id == user.id,
                            AuditLog.details.isnot(None),
                            AuditLog.details.like(f"%任务【{task_description}%"),
                            AuditLog.id < log.id,
                        )
                        .order_by(AuditLog.id.desc())
                        .first()
                    )
                    if request_log:
                        sub_task_id = extract_sub_task_id(request_log.details)
            if not sub_task_id:
                continue

            applicant_user_id = extract_applicant_user_id(details)
            if applicant_user_id is None:
                request_log = find_review_request_log_before(sub_task_id, log.id)
                applicant_user_id = request_log.user_id if request_log else None
            if applicant_user_id != user.id:
                continue

            sub_task = SubTask.query.get(sub_task_id)
            main_task = sub_task.main_task if sub_task else None
            phase = main_task.phase if main_task else None
            decision = "approve" if log.action == "approve_completion_review" else "reject"

            results.append(
                {
                    "id": log.id,
                    "subTaskId": sub_task_id,
                    "phaseTitle": phase.title if phase else "",
                    "mainTaskTitle": main_task.title if main_task else "",
                    "description": sub_task.description if sub_task else "",
                    "owner": sub_task.owner if sub_task else "",
                    "deadline": sub_task.deadline if sub_task else "",
                    "decision": decision,
                    "decisionLabel": "通过" if decision == "approve" else "驳回",
                    "reviewerName": log.user_name,
                    "reviewedAt": log.created_at.isoformat() if log.created_at else "",
                }
            )
        return jsonify(results)

    @app.post("/api/sub-tasks/<sub_task_id>/review-decision")
    @require_auth
    def decide_sub_task_review(user: User, sub_task_id):
        if user.role not in {"admin", "sub_admin"}:
            return jsonify({"error": "forbidden"}), 403

        payload = request.get_json(silent=True) or {}
        decision = str(payload.get("decision", "approve")).strip().lower()
        if decision not in {"approve", "reject"}:
            return jsonify({"error": "invalid decision"}), 400

        sub_task = SubTask.query.get_or_404(sub_task_id)
        if sub_task.status != "REVIEWING":
            return jsonify({"error": "task is not under review"}), 400

        review_meta = get_review_request_meta(sub_task)
        applicant_group = review_meta["applicant_group"]
        if not can_review_request(user, applicant_group):
            return jsonify({"error": "forbidden"}), 403

        review_from_status = review_meta["review_from_status"]
        if decision == "approve":
            block_reason = completion_block_reason(sub_task)
            if block_reason:
                return jsonify({"error": block_reason}), 400
            sub_task.status = "COMPLETED"
            db.session.commit()
            applicant = review_meta["applicant"]
            marker = (
                f"；[sub_task_id:{sub_task.id}]"
                f"{f'[applicant_user_id:{applicant.id}]' if applicant else ''}"
            )
            log_action(
                user,
                "approve_completion_review",
                (
                    f"审核通过：{task_context(sub_task)}；"
                    f"申请人【{review_meta['applicant_name']}】；"
                    f"原状态【{status_text(review_from_status)}】"
                    f"{marker}"
                ),
            )
            emit_update()
            return jsonify({"ok": True, "status": sub_task.status})

        rollback_status = review_from_status
        if rollback_status not in {"PENDING", "IN_PROGRESS"}:
            rollback_status = "IN_PROGRESS"
        reverse_block_reason = predecessor_downgrade_block_reason(sub_task, rollback_status)
        if reverse_block_reason:
            return jsonify({"error": reverse_block_reason}), 400
        sub_task.status = rollback_status
        db.session.commit()
        applicant = review_meta["applicant"]
        marker = (
            f"；[sub_task_id:{sub_task.id}]"
            f"{f'[applicant_user_id:{applicant.id}]' if applicant else ''}"
        )
        log_action(
            user,
            "reject_completion_review",
            (
                f"审核驳回：{task_context(sub_task)}；"
                f"申请人【{review_meta['applicant_name']}】；"
                f"恢复状态【{status_text(rollback_status)}】"
                f"{marker}"
            ),
        )
        emit_update()
        return jsonify({"ok": True, "status": sub_task.status})

    @app.delete("/api/sub-tasks/<sub_task_id>")
    @require_auth
    def delete_sub_task(user: User, sub_task_id):
        sub_task = SubTask.query.get_or_404(sub_task_id)
        SubTask.query.filter_by(predecessor_id=sub_task.id).update(
            {SubTask.predecessor_id: None},
            synchronize_session=False,
        )
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

    return app, socketio
