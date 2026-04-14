.PHONY: help up down build rebuild reset logs logs/backend logs/dagster \
       web/install web/dev web/start web/build web/check \
       backend/shell backend/logs backend/syntax \
       ml/train-intensity ml/train-clustering ml/register-all \
       dagster/ui dagster/logs dagster/materialize \
       db/shell db/reset \
       env setup clean

# ─── Config ──────────────────────────────────────────────────────────
PROJECT     := altvia
COMPOSE     := docker compose
FRONTEND    := frontend
BACKEND_SVC := backend

# ─── Colors ──────────────────────────────────────────────────────────
BLUE  := \033[34m
GREEN := \033[32m
YELLOW:= \033[33m
RED   := \033[31m
NC    := \033[0m

# ─── Help ────────────────────────────────────────────────────────────
help: ## Show this help
	@echo ""
	@echo "$(BLUE)$(PROJECT) Makefile$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_/%-]+:.*##' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*##"}; {printf "  $(GREEN)%-22s$(NC) %s\n", $$1, $$2}'
	@echo ""

# ─── Docker Compose ──────────────────────────────────────────────────
up: ## Start all services (detached)
	@echo "$(BLUE)Starting stack...$(NC)"
	$(COMPOSE) up -d
	@echo "$(GREEN)Stack is up$(NC)"

down: ## Stop all services
	@echo "$(BLUE)Stopping stack...$(NC)"
	$(COMPOSE) down
	@echo "$(GREEN)Stack stopped$(NC)"

build: ## Build all Docker images
	@echo "$(BLUE)Building images...$(NC)"
	$(COMPOSE) build
	@echo "$(GREEN)Build complete$(NC)"

rebuild: ## Rebuild images from scratch (no cache)
	@echo "$(BLUE)Rebuilding images (no cache)...$(NC)"
	$(COMPOSE) build --no-cache
	@echo "$(GREEN)Rebuild complete$(NC)"

reset: ## Stop, remove volumes, rebuild, and start fresh
	@echo "$(RED)Resetting entire stack (volumes will be destroyed)...$(NC)"
	$(COMPOSE) down -v
	$(COMPOSE) build
	$(COMPOSE) up -d
	@echo "$(GREEN)Stack reset complete$(NC)"

logs: ## Tail logs for all services
	$(COMPOSE) logs -f

logs/%: ## Tail logs for a specific service (e.g. make logs/backend)
	$(COMPOSE) logs -f $*

ps: ## Show running containers
	$(COMPOSE) ps

# ─── Frontend ────────────────────────────────────────────────────────
web/install: ## Install frontend dependencies
	@echo "$(BLUE)Installing frontend deps...$(NC)"
	cd $(FRONTEND) && npm install
	@echo "$(GREEN)Done$(NC)"

web/dev: ## Start frontend dev server (port 5173)
	cd $(FRONTEND) && npm run dev

web/start: ## Start frontend on port 3000
	cd $(FRONTEND) && npm run start

web/build: ## Build frontend for production
	@echo "$(BLUE)Building frontend...$(NC)"
	cd $(FRONTEND) && npm run build
	@echo "$(GREEN)Frontend built$(NC)"

web/check: ## Type-check frontend (no emit)
	cd $(FRONTEND) && npx tsc --noEmit

web/preview: ## Preview production build (port 3000)
	cd $(FRONTEND) && npm run preview

# ─── Backend ─────────────────────────────────────────────────────────
backend/shell: ## Open a bash shell in the backend container
	$(COMPOSE) exec $(BACKEND_SVC) bash

backend/logs: ## Tail backend logs
	$(COMPOSE) logs -f $(BACKEND_SVC)

backend/syntax: ## Syntax-check a Python file (usage: make backend/syntax F=path/to/file.py)
	@echo "$(BLUE)Checking syntax: $(F)$(NC)"
	python3 -c "import ast; ast.parse(open('$(F)').read()); print('OK')"

backend/exec: ## Run a command in the backend container (usage: make backend/exec CMD="python -c 'print(1)'")
	$(COMPOSE) exec $(BACKEND_SVC) $(CMD)

# ─── ML ──────────────────────────────────────────────────────────────
ml/enrich-effort: ## Compute effort scores for activities missing them
	@echo "$(BLUE)Running effort score enrichment...$(NC)"
	$(COMPOSE) exec dagster-webserver dagster job execute -m orchestration.definitions -j effort_score_enrichment_job
	@echo "$(GREEN)Effort score enrichment complete$(NC)"

ml/train-clustering: ## Run clustering enrichment and persist model via Dagster
	@echo "$(BLUE)Running clustering enrichment...$(NC)"
	$(COMPOSE) exec dagster-webserver dagster job execute -m orchestration.definitions -j clustering_enrichment_job
	@echo "$(GREEN)Clustering model trained and persisted$(NC)"

ml/train-intensity: ## Train intensity prediction model via Dagster
	@echo "$(BLUE)Training intensity model...$(NC)"
	$(COMPOSE) exec dagster-webserver dagster job execute -m orchestration.definitions -j intensity_prediction_training_job
	@echo "$(GREEN)Intensity model trained$(NC)"

ml/enrich-predictions: ## Run intensity prediction enrichment for all activities
	@echo "$(BLUE)Running intensity prediction enrichment...$(NC)"
	$(COMPOSE) exec dagster-webserver dagster job execute -m orchestration.definitions -j intensity_prediction_enrichment_job
	@echo "$(GREEN)Intensity prediction enrichment complete$(NC)"

ml/run-all: ml/enrich-effort ml/train-clustering ml/train-intensity ml/enrich-predictions ## Run full ML pipeline
	@echo "$(GREEN)Full ML pipeline complete$(NC)"

# ─── Dagster ─────────────────────────────────────────────────────────
dagster/logs: ## Tail dagster webserver logs
	$(COMPOSE) logs -f dagster-webserver dagster-daemon

dagster/materialize: ## Materialize all Dagster assets (usage: make dagster/materialize ASSET=asset_name)
ifdef ASSET
	$(COMPOSE) exec dagster-webserver dagster asset materialize -m orchestration.definitions --select $(ASSET)
else
	$(COMPOSE) exec dagster-webserver dagster asset materialize -m orchestration.definitions --select '*'
endif

# ─── Database ────────────────────────────────────────────────────────
db/shell: ## Open psql shell in postgres container
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-altvia} -d $${POSTGRES_DB:-altvia}

db/reset: ## Drop and recreate the database (destructive!)
	@echo "$(RED)Resetting database...$(NC)"
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-altvia} -d postgres \
		-c "DROP DATABASE IF EXISTS $${POSTGRES_DB:-altvia};" \
		-c "CREATE DATABASE $${POSTGRES_DB:-altvia};"
	@echo "$(YELLOW)Restarting backend to re-init schema...$(NC)"
	$(COMPOSE) restart $(BACKEND_SVC)
	@echo "$(GREEN)Database reset complete$(NC)"

# ─── Setup / Utilities ──────────────────────────────────────────────
env: ## Copy .env.example to .env (won't overwrite)
	@if [ -f .env ]; then \
		echo "$(YELLOW).env already exists, skipping$(NC)"; \
	else \
		cp .env.example .env; \
		echo "$(GREEN).env created from .env.example$(NC)"; \
	fi

setup: env build up web/install ## First-time setup: env, build, start stack, install frontend deps
	@echo ""
	@echo "$(GREEN)Setup complete!$(NC)"
	@echo "  Backend:  http://localhost:8000"
	@echo "  Frontend: cd frontend && npm run dev"
	@echo "  Dagster:  http://localhost:3001"
	@echo "  MLflow:   http://localhost:5000"

clean: ## Remove stopped containers, dangling images, and volumes
	@echo "$(RED)Cleaning up...$(NC)"
	$(COMPOSE) down -v --remove-orphans
	docker image prune -f
	@echo "$(GREEN)Clean complete$(NC)"
