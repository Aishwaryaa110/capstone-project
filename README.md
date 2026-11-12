# Peer Learning & Doubt Resolution Network

A full-stack academic project MVP built with React, Vite, Express, MongoDB, JWT, Socket.IO, optional Redis/BullMQ, and optional SMTP email.

## Included functionality
- Student registration/login with bcrypt password hashing and JWT authentication
- Student/mentor/admin roles (admin role assigned to the email configured in `ADMIN_EMAIL` at registration)
- Anonymous doubt posting with per-post aliases
- Doubt feed, search, subject filtering and detail view
- Subject/topic/reputation/workload-based helper recommendation
- Answers, accepted answers and reputation points
- Leaderboard and editable learning profile
- Persistent in-app notifications and Socket.IO delivery
- Optional Redis/BullMQ notification queue with retry/backoff and worker
- Optional SMTP email notifications
- Content reporting and admin moderation endpoints
- Admin statistics dashboard

Matching is explainable rule-based scoring, not a trained machine-learning model. Redis and SMTP are optional integrations and require credentials to activate.

## Requirements
- Node.js 20 or newer
- MongoDB Atlas cluster (or local MongoDB)
- Git

## Run locally

### 1. Configure the backend
Copy `server/.env.example` to `server/.env` and fill in:

```env
PORT=5000
MONGO_URI=mongodb+srv://DB_USER:DB_PASSWORD@YOUR_CLUSTER.mongodb.net/peer_learning?retryWrites=true&w=majority
JWT_SECRET=replace-with-a-long-random-secret
CLIENT_URL=http://localhost:5173
ADMIN_EMAIL=your-admin-email@example.com
```

Keep `.env` private. Never commit it or share database credentials. If your database password contains special characters, URL-encode them in the connection string.

### 2. Start the backend
```bash
cd server
npm install
npm run dev
```
API health check: `http://localhost:5000/api/health`

### 3. Start the frontend (new terminal)
```bash
cd client
npm install
npm run dev
```
Open `http://localhost:5173`.

Register using the exact email set in `ADMIN_EMAIL` to create the admin account. Other registrations are students; a user can change their role to peer mentor from the profile interface.

## Optional background queue and email
Set these in `server/.env` only if you have the services/credentials:

```env
REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_UPSTASH_HOST:6379
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
MAIL_FROM=Peerly <no-reply@example.com>
```

When `REDIS_URL` is configured, start the worker in another terminal:
```bash
cd server
npm run worker
```
Without Redis, notifications are stored and delivered directly by the API. Without SMTP, email is disabled; in-app notifications remain available.

## Upload to GitHub quickly
1. Extract this ZIP.
2. Open the extracted `Peer-Learning-Network-Final` folder.
3. Create a new empty repository on GitHub.
4. In the repository page choose **Add file → Upload files**.
5. Drag the *contents* of the extracted project folder (the `client`, `server`, `.gitignore`, and `README.md` items) into the upload area. Do not upload the ZIP as the only repository file.
6. Commit the upload.

Alternatively, from a terminal opened in the project root:
```bash
git init
git add .
git commit -m "Initial Peer Learning Network project"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

The `.gitignore` excludes `.env`, `node_modules`, build output and logs.

## Deployment overview
- Frontend: Vercel, root directory `client`, build `npm run build`, output `dist`; set `VITE_API_URL` to the deployed backend URL ending in `/api`.
- Backend: Render Web Service, root directory `server`, build `npm install`, start `npm start`; configure `MONGO_URI`, `JWT_SECRET`, `CLIENT_URL`, and `ADMIN_EMAIL` in Render environment variables.
- Optional worker: Render Background Worker, root directory `server`, start command `npm run worker`; configure the same MongoDB and Redis environment variables.
- MongoDB Atlas Network Access must permit the deployed backend to connect. Prefer restricting access appropriately rather than leaving broad access enabled permanently.

## Submission note
This is an academic MVP. Before claiming production readiness, run the app with your own service credentials and test registration, login, anonymous posting, matching, answers, accepted-answer points, notifications, reports, and admin review. Redis/BullMQ and email work only when their optional services are configured.
