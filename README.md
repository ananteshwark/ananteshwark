# Enterprise ERP Platform

A production-grade, multi-tenant Enterprise ERP platform built with NestJS, React, TypeScript, and PostgreSQL.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Enterprise ERP Platform                    │
├─────────────────────────────────────────────────────────────┤
│  React 18 + TypeScript + Vite + TailwindCSS (Port 5173)     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │  Auth    │ │Dashboard │ │  Users   │ │  Workflows   │  │
│  │  Pages   │ │  Pages   │ │  & RBAC  │ │  & Audit     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  Zustand + React Query + i18next + react-hot-toast          │
├─────────────────────────────────────────────────────────────┤
│  NestJS 10 API (Port 3000)                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ Tenants  │ │  Auth    │ │  Users   │ │    RBAC      │  │
│  │ Module   │ │  Module  │ │  Module  │ │    Module    │  │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├──────────────┤  │
│  │Workflow  │ │Notif.    │ │  Audit   │ │   Health     │  │
│  │ Engine   │ │ Module   │ │  Module  │ │   Module     │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
│  JWT Auth + TypeORM + Bull Queues + Swagger                 │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure                                              │
│  ┌──────────────────────┐  ┌─────────────────────────────┐ │
│  │  PostgreSQL 16        │  │      Redis 7                │ │
│  │  + Row Level Security │  │  (Cache + Bull Queues)      │ │
│  └──────────────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker & Docker Compose

## Quick Start

### Option 1: Docker Compose (recommended)

```bash
# Start all services
docker-compose up -d

# Access:
# Web UI: http://localhost:5173
# API:    http://localhost:3000
# Docs:   http://localhost:3000/api/docs
```

### Option 2: Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Start databases
docker-compose up -d postgres redis

# 3. Setup API environment
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env with your settings

# 4. Start API (in one terminal)
cd apps/api && pnpm dev

# 5. Start Web (in another terminal)
cd apps/web && pnpm dev
```

### Seed Demo Data

```bash
cd apps/api && pnpm seed
```

## Demo Credentials

After seeding:
- **URL**: http://localhost:5173
- **Email**: admin@demo.com
- **Password**: Admin@123
- **Tenant Slug**: demo

## Environment Variables

### API (`apps/api/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_PORT` | API server port | `3000` |
| `APP_ENV` | Environment (development/production) | `development` |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `REDIS_URL` | Redis connection string | - |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_REFRESH_SECRET` | Refresh token signing secret | - |
| `JWT_EXPIRATION` | Access token TTL | `15m` |
| `JWT_REFRESH_EXPIRATION` | Refresh token TTL | `7d` |
| `SMTP_HOST` | SMTP server hostname | - |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username | - |
| `SMTP_PASSWORD` | SMTP password | - |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated) | - |

## Module Status

| Module | Status | Description |
|--------|--------|-------------|
| Tenants | Complete | Multi-tenant management, RLS setup |
| Auth | Complete | JWT auth, refresh tokens, password management |
| Users | Complete | User management, invitations, bulk invite |
| RBAC | Complete | Role-based access control, permission matrix |
| Workflow Engine | Complete | Multi-step approval workflows |
| Notifications | Complete | In-app notifications, templates |
| Audit Trail | Complete | Immutable audit log with diff tracking |
| Health | Complete | Health, readiness, liveness probes |

## API Documentation

Swagger UI available at: **http://localhost:3000/api/docs**

Supports JWT Bearer auth and X-Tenant-ID header authentication.

## Frontend Pages

| Route | Description |
|-------|-------------|
| `/login` | Email/password login with tenant detection |
| `/register` | New tenant registration |
| `/onboarding` | 5-step onboarding wizard |
| `/dashboard` | KPI cards, pending approvals, quick actions |
| `/users` | User management with search and pagination |
| `/users/invite` | Single user invitation form |
| `/roles` | Role and permission matrix management |
| `/workflows` | Workflow definitions and pending approvals |
| `/notifications` | Notification list with read/unread status |
| `/audit` | Audit log with expandable before/after diffs |
| `/settings/general` | Company branding and info |
| `/settings/modules` | Enable/disable ERP modules |

## Tech Stack

### Backend
- NestJS 10 + TypeScript 5
- TypeORM 0.3 + PostgreSQL 16
- Redis 7 + Bull (job queues)
- JWT authentication (access + refresh tokens)
- Passport.js (JWT + Local strategies)
- Swagger/OpenAPI documentation
- class-validator + class-transformer

### Frontend
- React 18 + TypeScript 5
- Vite 5 (build tool)
- TailwindCSS 3 (styling)
- React Router v6 (routing)
- React Query / TanStack Query v5 (server state)
- Zustand (client state)
- i18next + react-i18next (i18n: English + Hindi)
- react-hot-toast (notifications)
- Lucide React (icons)

### Infrastructure
- Docker Compose (local dev)
- PostgreSQL with Row Level Security
- Redis for caching and queues
- Nginx (production web server)
