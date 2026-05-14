# AutoReview

AI-powered code reviews for Bitbucket Cloud repositories.

## Overview

AutoReview is a self-hosted web application that automates code review for Bitbucket Cloud repositories. It analyzes commits using LLM providers (OpenAI, Anthropic, Gemini, ZAI, or any OpenAI-compatible API), classifies findings by severity, and generates structured email drafts with review results. The platform features an administrative interface to configure everything from review modes to prompt templates.

## Features

- **Manual and Automatic Review Modes** — Trigger reviews on demand via the UI or configure background polling for new commits and PR updates.
- **Deduplication** — Prevents duplicate reviews if a commit has already been analyzed to save API costs and reduce noise.
- **Multi-Provider LLM Support** — Native presets for OpenAI, Anthropic, Google Gemini, ZAI, alongside support for any custom OpenAI-compatible API.
- **Finding Classification** — AI intelligently classifies findings into actionable severity levels: *Must Fix*, *Should Fix Soon*, and *Ignore for Now*.
- **Configurable Strictness** — Tailor the AI's aggressiveness per repository using *Strict*, *Balanced*, or *Light* modes.
- **Prompt Template Management** — Edit, test, and AI-enhance the system prompt templates directly via the admin UI. Allows per-strictness level customization.
- **Email & Notification Generation** — Automatically send finding summaries via configured SMTP servers, or generate a draft to manually copy-paste.
- **File Exclusions** — Prevent the analysis of specified files (like `node_modules`, `*.min.js`, etc.) with customizable per-repository patterns.
- **Per-Repository Configuration** — Granular control over credentials, models, notification recipients, and review triggers.
- **Security & Performance** — Features AES-256-GCM encrypted storage for sensitive data (API keys, App Passwords), JWT role-based access control (Admin/User), and robust rate-limiting.
- **Linear-Inspired UI** — A clean, stark black-and-white architectural design featuring light and dark modes, powered by Tailwind CSS, Radix UI, and Framer Motion.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express, TypeScript |
| Frontend | React 19, Vite 6, Redux Toolkit, Tailwind CSS v3 |
| UI Components | Radix UI primitives, Framer Motion |
| Database | PostgreSQL (Supabase compatible) |
| AI Integration | OpenAI SDK (Supports any OpenAI-compatible API) |
| VCS Integration| Bitbucket Cloud REST API |
| Authentication | JWT (bcryptjs + jsonwebtoken) |
| Encryption | AES-256-GCM |
| Deployment | Docker Compose |

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- PostgreSQL database

### Development

```bash
# Server
cd server
cp .env.example .env
# Edit .env — set ENCRYPTION_KEY, JWT_SECRET, and DATABASE_URL
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

> This default admin user is only created automatically when `NODE_ENV` is not `production`.

## Environment Variables

| Variable | Description | Default | Required |
|---|---|---|---|
| `PORT` | Server port | `3001` | No |
| `DATABASE_URL` | PostgreSQL connection string | — | Yes |
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
export DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Build and run
docker compose up -d
```

The application is available at `http://localhost:3000`.

## Project Structure

```
AutoReview/
├── server/                 # Express API server
│   ├── src/
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Core business logic, review engine, AI orchestration
│   │   ├── middleware/     # Auth checks, error handlers
│   │   ├── db/             # PostgreSQL schemas and queries
│   │   └── __tests__/      # Vitest test suite
│   └── package.json
├── client/                 # React frontend
│   ├── src/
│   │   ├── pages/          # App Views (Dashboard, Settings, ManualReview)
│   │   ├── store/          # Redux global state management
│   │   ├── components/     # Reusable UI components
│   │   └── services/       # API wrapper client
│   └── package.json
├── Dockerfile              # Multi-stage Docker build
├── docker-compose.yml      # Single app service orchestration
└── TODO.MD                 # Future enhancements and tasks
```

## API Overview

All API interactions occur under the `/api/` path and require `JWT Bearer` token authentication (excluding public endpoints). Endpoints for configuration are restricted to users with the `admin` role.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | None | Authenticate and obtain JWT |
| GET | `/api/auth/me` | JWT | Get current session info |
| GET | `/api/reviews` | JWT | Fetch review history |
| POST | `/api/reviews/manual` | JWT | Request a manual commit review |
| CRUD | `/api/repositories` | Admin | Manage Bitbucket repositories |
| CRUD | `/api/providers` | Admin | Configure custom or preset LLM Providers |
| CRUD | `/api/credentials` | Admin | Manage encrypted Bitbucket App Passwords |
| CRUD | `/api/settings/prompt-template` | Admin | Customize LLM review behavior |
| GET/PUT| `/api/settings/llm/:repo_id` | Admin | Override LLM provider/model per repo |
| GET/PUT| `/api/settings/smtp/:repo_id` | Admin | Set up SMTP config for notifications |
| GET | `/api/health` | None | Service heartbeat |

## License

To be determined.
