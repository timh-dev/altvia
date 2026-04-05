# Altvia V1

Altvia is a geospatial endurance intelligence platform focused on movement, terrain, and performance analysis.

V1 establishes a local development stack with:

- React + TypeScript + Vite frontend
- Tailwind CSS and shadcn-style UI primitives
- Zustand state management
- FastAPI backend
- PostgreSQL + PostGIS data layer
- Dagster orchestration
- MLflow experiment tracking

## Product Scope

V1 is centered on activity ingestion and analysis, with Apple Health as the first ingestion target.

Primary goals:

- Import Apple Health exports
- Normalize workouts and related metrics into backend data models
- Expose API endpoints for health, activities, imports, and future route analysis
- Establish orchestration for ingestion and ML workflows
- Stand up a branded frontend shell for overview, sessions, paths, and analysis

## Architecture

The backend is structured so the API stays thin. FastAPI should handle request validation, response shaping, and routing, while the reusable application logic lives outside the API layer.

Request flow:

```text
client -> api/router -> service -> repository/model
                           -> ingestion/parser
                           -> ml/inference
```

This keeps the same core logic reusable across:

- HTTP endpoints
- Dagster jobs
- background workers
- CLI/scripts
- tests

## Repository Layout

```text
altvia/
├── backend/
│   ├── app/
│   │   ├── api/              # FastAPI routers/controllers only
│   │   ├── core/             # settings and shared app config
│   │   ├── db/               # engine, session, metadata bootstrap
│   │   ├── geospatial/       # route/elevation/spatial utilities
│   │   ├── ingestion/        # Apple Health and future import parsers
│   │   ├── ml/               # MLflow integration, features, inference
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── repositories/     # data access layer
│   │   ├── schemas/          # Pydantic request/response contracts
│   │   ├── services/         # business logic used by API and jobs
│   │   └── main.py           # FastAPI app entrypoint
│   ├── orchestration/        # Dagster assets and definitions
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── lib/
│   │   ├── routes/
│   │   ├── store/
│   │   └── styles/
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── docker/
│   └── dagster/
│       └── workspace.yaml
├── apple_health_export/      # local sample export data for development
├── .env.example
├── docker-compose.yml
└── README.md
```

## Backend Boundaries

- `backend/app/api/`: FastAPI routes only
- `backend/app/models/`: SQLAlchemy ORM models
- `backend/app/schemas/`: Pydantic request and response contracts
- `backend/app/services/`: domain logic
- `backend/app/repositories/`: database access logic
- `backend/app/ingestion/`: Apple Health and future Garmin/GPX/FIT/TCX parsers
- `backend/app/geospatial/`: route and spatial logic
- `backend/app/ml/`: experiment tracking, features, training, inference
- `backend/orchestration/`: Dagster assets and orchestration definitions

## Frontend Boundaries

- `frontend/src/routes/`: top-level app screens
- `frontend/src/components/`: UI and layout components
- `frontend/src/store/`: Zustand stores
- `frontend/src/lib/`: API client, config, and utilities
- `frontend/src/styles/`: global CSS and theme tokens

## Current Status

What is implemented now:

- Docker Compose stack for `backend`, `postgres`, `mlflow`, `dagster-webserver`, and `dagster-daemon`
- FastAPI app entrypoint with `/health`
- API routes for activity listing and Apple Health import submission
- initial SQLAlchemy models for activities and import jobs
- database bootstrap that creates the PostGIS extension and tables on startup
- Apple Health ingestion stub that currently validates accepted file types
- Dagster definitions with a starter Apple Health asset
- frontend overview shell with API health check wiring

What is not complete yet:

- end-to-end Apple Health parsing and workout persistence
- Alembic migrations
- background job execution for imports
- frontend session list/detail flows
- production-grade MLflow artifact storage and model workflows

## Local Stack

Services started by Docker Compose:

- `backend` on `http://localhost:8000`
- `postgres` on `localhost:5432`
- `mlflow` on `http://localhost:5000`
- `dagster-webserver` on `http://localhost:3001`
- `dagster-daemon`

Frontend runs locally with Vite:

- `frontend` on `http://localhost:3000`

## Getting Started

```bash
cp .env.example .env
docker compose up -d
cd frontend
npm install
npm run start
```

The frontend reads `VITE_API_BASE_URL` from [`frontend/src/lib/config.ts`](/Users/timholmes/Documents/development/personal/altvia/frontend/src/lib/config.ts) and defaults to `http://localhost:8000`, so no extra local frontend env is required for the default setup.

## Hosting A Coming Soon Page On Vercel

If you only want a public placeholder site for now, deploy the `public-site/` app to Vercel as a static coming-soon page.

In Vercel, create a new project from this repo and set:

- Root Directory: `public-site`
- Framework Preset: `Vite`
- Build Command: `npm run build`
- Output Directory: `dist`

This repo includes [`public-site/vercel.json`](/Users/timholmes/Documents/development/personal/altvia/public-site/vercel.json), and the current [`public-site/src/App.tsx`](/Users/timholmes/Documents/development/personal/altvia/public-site/src/App.tsx) is a self-contained placeholder page with no backend dependency.

For this placeholder deployment, no Vercel environment variables are required.

## API Surface Today

- `GET /health`
- `GET /api/activities/`
- `POST /api/imports/apple-health`

The Apple Health import endpoint currently accepts `.xml` and `.zip` uploads and creates an import job record. Full parsing and workout persistence are the next major backend milestone.

## Recommended Next Steps

1. Build the Apple Health import pipeline end to end: upload, persist raw import, parse export, store workouts
2. Add Alembic migrations for schema evolution instead of relying only on startup table creation
3. Expand activity and import domain models to cover normalized workout metrics and route geometry
4. Add frontend session list and detail views wired to the backend API
5. Grow Dagster jobs/assets for ingestion, normalization, backfills, and model workflows
