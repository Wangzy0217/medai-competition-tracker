<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/temp/1

## Run Locally

**Prerequisites:**  Node.js, Python 3.10+, MySQL


1. Install dependencies:
   `npm install`
2. (Optional) Set frontend API endpoints in `.env.local`:
   `VITE_API_BASE=http://localhost:5000`
   `VITE_SOCKET_URL=http://localhost:5000`
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
