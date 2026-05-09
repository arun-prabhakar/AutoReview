# AutoReview

AI-powered code reviews for Bitbucket Cloud repositories.

## Overview

AutoReview is a self-hosted web application that automates code review for Bitbucket Cloud repositories. It analyzes commits using LLM providers (OpenAI, Anthropic, Gemini, or any OpenAI-compatible API), classifies findings by severity, and generates structured email drafts with review results.

## Features

- **Manual and automatic review modes** — trigger reviews on demand or poll for new commits
- **Multi-provider LLM support** — OpenAI, Anthropic, Google Gemini, ZAI, or any OpenAI-compatible API
- **Bitbucket Cloud integration** — fetches diffs, commits, and PR data; posts findings as PR comments
- **Severity classification** — Must Fix / Should Fix Soon / Ignore
- **Configurable strictness** — strict, balanced, or light review modes per repository
- **Email draft generation** — automatic via SMTP or manual copy from the UI
- **Prompt template management** — customizable with AI enhancement and per-strictness overrides
- **Per-repository settings** — review mode, polling, exclusions, notifications, LLM config
- **JWT authentication** — role-based access control (admin/user)
- **Encrypted storage** — AES-256-GCM for credentials, API keys, and SMTP passwords
- **Dark/light theme** — Linear-inspired design with Framer Motion animations

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Frontend | React 19, Vite 6, Redux Toolkit, Tailwind CSS |
| UI | Radix UI primitives, Framer Motion |
| Database | SQLite (sql.js / WASM) |
| AI | OpenAI SDK (any OpenAI-compatible API) |
| VCS | Bitbucket Cloud |
| Deployment | Docker Compose |

## Quick Start

### Prerequisites

- Node.js 20+
- npm

### Development

```bash
# Server
cd server
cp .env.example .env
# Edit .env — set ENCRYPTION_KEY and JWT_SECRET
npm install
npm run dev

# Client (separate terminal)
cd client
npm install
npm run dev
```

The server runs on `http://localhost:3001` and the client on `http://localhost:5173` (with API proxy to the server).

### Default Login (Development)

| Username | Password |
|---|---|
| `admin` | `admin` |

> This default admin user is only created when `NODE_ENV` is not `production`.

## Environment Variables

| Variable | Description | Default | Required |
|---|---|---|---|
| `PORT` | Server port | `3001` | No |
| `DB_PATH` | SQLite database file path | `./data/autoreview.db` | No |
| `NODE_ENV` | `production` or `development` | — | No |
| `STATIC_DIR` | React build output directory | `./public` | No |
| `LOG_DIR` | Log file directory | `./logs` | No |
| `ENCRYPTION_KEY` | 64-char hex string for AES-256-GCM encryption | — | Yes |
| `JWT_SECRET` | JWT signing secret | — | Yes (production) |

## Docker Deployment

```bash
# Set required environment variables
export ENCRYPTION_KEY=your-64-char-hex-key
export JWT_SECRET=your-jwt-secret

# Build and run
docker compose up -d
```

The application is available at `http://localhost:3000`.

## Project Structure

```
AutoReview/
├── server/                 # Express API server
│   ├── src/
│   │   ├── routes/         # API endpoints (auth, reviews, repos, settings, etc.)
│   │   ├── services/       # Business logic (review engine, Bitbucket client, etc.)
│   │   ├── middleware/     # JWT auth, request logging, error handling
│   │   ├── db/             # SQLite schema, queries, initialization
│   │   └── __tests__/      # Server tests (Vitest)
│   └── package.json
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/          # Dashboard, ManualReview, ReviewDetail, Settings, Login
│   │   ├── store/          # Redux slices (auth, reviews, settings, etc.)
│   │   ├── services/       # API client (fetch wrapper with JWT)
│   │   ├── components/     # UI components (Radix UI based)
│   │   └── lib/            # Utilities and animations
│   └── package.json
├── Dockerfile              # Multi-stage build (builder + runner)
├── docker-compose.yml      # Single app service
├── AGENT.MD                # Full project and architecture documentation
└── DESIGN.MD               # UI/UX design system
```

## API Overview

All endpoints are under `/api/`. Authentication uses JWT Bearer tokens. Admin-only endpoints require the `admin` role.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | None | Authenticate and get JWT |
| GET | `/api/auth/me` | JWT | Current user info |
| GET | `/api/reviews` | JWT | List reviews |
| POST | `/api/reviews/manual` | JWT | Trigger manual review |
| GET/POST/PUT/DELETE | `/api/providers` | Admin | Manage LLM providers |
| GET/POST/PUT/DELETE | `/api/repositories` | Admin | Manage repositories |
| GET/POST/DELETE | `/api/credentials` | Admin | Manage Bitbucket credentials |
| GET/PUT | `/api/settings/llm/:repo_id` | Admin | Per-repo LLM config |
| GET/PUT | `/api/settings/smtp/:repo_id` | Admin | Per-repo SMTP config |
| GET/POST/PUT/DELETE | `/api/settings/prompt-template` | Admin | Prompt templates |
| GET | `/api/health` | None | Health check |

Full API documentation is in [AGENT.MD](./AGENT.MD).

## License

To be determined.
