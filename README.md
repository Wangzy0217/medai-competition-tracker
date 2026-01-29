<div align="center">

</div>

# 第一个用AI写的项目

大概用了3-4个小时的一个小项目。

## Run Locally

**Prerequisites:**  Node.js, Python 3.10+, MySQL


1. Install dependencies:
   `npm install`
2. (Optional) Set frontend API endpoints in `.env.local`:
   `VITE_API_BASE=http://localhost:5001`
   `VITE_SOCKET_URL=http://localhost:5001`
3. Set up the backend:
   - Create a MySQL database `medai_tracker`
   - Copy `backend/.env.example` to `backend/.env` and update `DATABASE_URL`
   - Install Python deps: `pip install -r backend/requirements.txt`
   - Start backend: `python backend/run.py`
4. Run the app:
   `npm run dev`

## Default Admin

- 用户名（手机号字段）：`admin`
- 密码：`123456`
