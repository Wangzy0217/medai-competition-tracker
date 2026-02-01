#!/usr/bin/env python3
import argparse
import os
import subprocess
from pathlib import Path

# === 配置区（请按你的服务器环境修改）===
CONFIG = {
    # 项目根目录（默认脚本所在目录）
    "repo_dir": str(Path(__file__).resolve().parent),
    # systemd 后端服务名（必填，示例：medai-backend.service）
    "backend_service": "",
    # Python 虚拟环境激活脚本（可选）
    "venv_activate": "",
    # 是否执行 pip 安装依赖（可选）
    "run_pip_install": False,
    "pip_requirements": "backend/requirements.txt",
    # 是否执行 npm 安装依赖（可选）
    "run_npm_install": False,
    "npm_install_cmd": "npm install",
    "npm_build_cmd": "npm run build",
    # Nginx 静态目录（必填；如与 dist 同目录则自动跳过拷贝）
    "nginx_root": "/home/admin/medai-competition-tracker/dist",
    # 是否 reload Nginx
    "nginx_reload": True,
}


def run(cmd, cwd=None):
    print(f"\n$ {cmd}")
    subprocess.run(cmd, cwd=cwd, shell=True, check=True)


def resolve_path(base, maybe_relative):
    p = Path(maybe_relative)
    if p.is_absolute():
        return p
    return Path(base) / p


def main():
    parser = argparse.ArgumentParser(description="一键部署脚本（后端 systemd + 前端 Nginx）")
    parser.add_argument("--skip-pull", action="store_true", help="跳过 git pull")
    parser.add_argument("--skip-backend", action="store_true", help="跳过后端部署")
    parser.add_argument("--skip-frontend", action="store_true", help="跳过前端部署")
    parser.add_argument("--skip-nginx", action="store_true", help="跳过 Nginx reload")
    args = parser.parse_args()

    repo_dir = Path(CONFIG["repo_dir"]).resolve()
    dist_dir = repo_dir / "dist"
    nginx_root = Path(CONFIG["nginx_root"]).resolve()

    if not args.skip_pull:
        run("git pull", cwd=str(repo_dir))

    if not args.skip_backend:
        if not CONFIG["backend_service"]:
            raise SystemExit("未配置 backend_service，请在 deploy.py 顶部 CONFIG 中填写。")
        if CONFIG["run_pip_install"]:
            if CONFIG["venv_activate"]:
                venv_activate = resolve_path(repo_dir, CONFIG["venv_activate"])
                pip_req = resolve_path(repo_dir, CONFIG["pip_requirements"])
                run(f"bash -lc 'source {venv_activate} && pip install -r {pip_req}'", cwd=str(repo_dir))
            else:
                pip_req = resolve_path(repo_dir, CONFIG["pip_requirements"])
                run(f"pip install -r {pip_req}", cwd=str(repo_dir))
        run(f"sudo systemctl restart {CONFIG['backend_service']}")
        run(f"sudo systemctl status {CONFIG['backend_service']} --no-pager")

    if not args.skip_frontend:
        if CONFIG["run_npm_install"]:
            run(CONFIG["npm_install_cmd"], cwd=str(repo_dir))
        run(CONFIG["npm_build_cmd"], cwd=str(repo_dir))
        if nginx_root != dist_dir:
            run(f"sudo rsync -av --delete {dist_dir}/ {nginx_root}/")

    if CONFIG["nginx_reload"] and not args.skip_nginx:
        run("sudo nginx -s reload")

    print("\n✅ 部署完成")


if __name__ == "__main__":
    main()
