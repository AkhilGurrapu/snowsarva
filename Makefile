# Snowsarva Makefile
# Data Observability and Cost Management Platform

# Configuration
REGISTRY_PREFIX ?= snowsarva
VERSION ?= 1.0.0
PLATFORM ?= linux/amd64
SNOWFLAKE_REGISTRY ?= 

# Default target
.PHONY: help
help: ## Show this help message
	@echo "Snowsarva - Data Observability and Cost Management Platform"
	@echo ""
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: build
build: ## Build all containers
	@echo "Building Snowsarva containers..."
	./build_containers.sh

.PHONY: build-backend
build-backend: ## Build backend container only
	@echo "Building backend container..."
	cd backend && docker build --platform $(PLATFORM) -t $(REGISTRY_PREFIX)/snowsarva_backend:$(VERSION) .
	docker tag $(REGISTRY_PREFIX)/snowsarva_backend:$(VERSION) $(REGISTRY_PREFIX)/snowsarva_backend:latest

.PHONY: build-frontend
build-frontend: ## Build frontend container only
	@echo "Building frontend container..."
	cd frontend && docker build --platform $(PLATFORM) -t $(REGISTRY_PREFIX)/snowsarva_frontend:$(VERSION) .
	docker tag $(REGISTRY_PREFIX)/snowsarva_frontend:$(VERSION) $(REGISTRY_PREFIX)/snowsarva_frontend:latest

.PHONY: build-router
build-router: ## Build router container only
	@echo "Building router container..."
	cd router && docker build --platform $(PLATFORM) -t $(REGISTRY_PREFIX)/snowsarva_router:$(VERSION) .
	docker tag $(REGISTRY_PREFIX)/snowsarva_router:$(VERSION) $(REGISTRY_PREFIX)/snowsarva_router:latest

.PHONY: push
push: build ## Build and push containers to Snowflake registry
	@if [ -z "$(SNOWFLAKE_REGISTRY)" ]; then \
		echo "Error: SNOWFLAKE_REGISTRY not set"; \
		echo "Set it to your Snowflake image repository URL"; \
		exit 1; \
	fi
	./build_containers.sh push

.PHONY: clean
clean: ## Clean up Docker images
	@echo "Cleaning up Docker images..."
	-docker rmi $(REGISTRY_PREFIX)/snowsarva_backend:$(VERSION) $(REGISTRY_PREFIX)/snowsarva_backend:latest
	-docker rmi $(REGISTRY_PREFIX)/snowsarva_frontend:$(VERSION) $(REGISTRY_PREFIX)/snowsarva_frontend:latest
	-docker rmi $(REGISTRY_PREFIX)/snowsarva_router:$(VERSION) $(REGISTRY_PREFIX)/snowsarva_router:latest
	docker image prune -f

.PHONY: test-backend
test-backend: ## Run backend tests
	@echo "Running backend tests..."
	cd backend && python -m pytest tests/ -v --cov=src --cov-report=html

.PHONY: test-frontend
test-frontend: ## Run frontend tests
	@echo "Running frontend tests..."
	cd frontend && npm test -- --coverage --watchAll=false

.PHONY: lint-backend
lint-backend: ## Lint backend code
	@echo "Linting backend code..."
	cd backend && python -m flake8 src tests
	cd backend && python -m black --check src tests
	cd backend && python -m isort --check-only src tests

.PHONY: lint-frontend
lint-frontend: ## Lint frontend code
	@echo "Linting frontend code..."
	cd frontend && npm run lint

.PHONY: format-backend
format-backend: ## Format backend code
	@echo "Formatting backend code..."
	cd backend && python -m black src tests
	cd backend && python -m isort src tests

.PHONY: format-frontend
format-frontend: ## Format frontend code
	@echo "Formatting frontend code..."
	cd frontend && npm run lint:fix

.PHONY: install-backend
install-backend: ## Install backend dependencies
	@echo "Installing backend dependencies..."
	cd backend && pip install -r requirements.txt
	cd backend && pip install -r requirements-dev.txt

.PHONY: install-frontend
install-frontend: ## Install frontend dependencies
	@echo "Installing frontend dependencies..."
	cd frontend && npm install

.PHONY: dev-backend
dev-backend: ## Run backend in development mode
	@echo "Starting backend in development mode..."
	cd backend && python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8081

.PHONY: dev-frontend
dev-frontend: ## Run frontend in development mode
	@echo "Starting frontend in development mode..."
	cd frontend && npm start

.PHONY: validate-app
validate-app: ## Validate Native App package structure
	@echo "Validating Native App package structure..."
	@if [ ! -f app/manifest.yml ]; then echo "Error: app/manifest.yml not found"; exit 1; fi
	@if [ ! -f app/setup.sql ]; then echo "Error: app/setup.sql not found"; exit 1; fi
	@if [ ! -f app/service-spec.yaml ]; then echo "Error: app/service-spec.yaml not found"; exit 1; fi
	@echo "Native App package structure is valid"

.PHONY: package
package: build validate-app ## Build and package the Native App
	@echo "Creating Native App package..."
	@mkdir -p dist
	@cp -r app/ dist/
	@echo "Native App package created in dist/"

.PHONY: local-test
local-test: ## Run local integration tests
	@echo "Running local integration tests..."
	docker-compose -f docker-compose.test.yml up --build --abort-on-container-exit
	docker-compose -f docker-compose.test.yml down

.PHONY: docs
docs: ## Generate documentation
	@echo "Generating documentation..."
	cd backend && python -m pdoc src --html --output-dir ../docs/backend
	cd frontend && npm run build:docs

.PHONY: security-scan
security-scan: ## Run security scans
	@echo "Running security scans..."
	cd backend && python -m bandit -r src/
	cd frontend && npm audit --audit-level moderate

.PHONY: setup-dev
setup-dev: install-backend install-frontend ## Setup development environment
	@echo "Setting up development environment..."
	@echo "Installing pre-commit hooks..."
	pre-commit install || echo "pre-commit not available, skipping hooks"
	@echo "Development environment setup complete"

.PHONY: all
all: clean build test-backend test-frontend lint-backend lint-frontend package ## Run all build and test targets

# Environment-specific targets
.PHONY: prod
prod: ## Build for production
	$(MAKE) build VERSION=$(VERSION) PLATFORM=$(PLATFORM)
	$(MAKE) validate-app
	$(MAKE) package

.PHONY: staging  
staging: ## Build for staging
	$(MAKE) build VERSION=$(VERSION)-staging PLATFORM=$(PLATFORM)

# Snowflake-specific targets
.PHONY: snowflake-login
snowflake-login: ## Login to Snowflake Docker registry
	@if [ -z "$(SNOWFLAKE_REGISTRY)" ]; then \
		echo "Error: SNOWFLAKE_REGISTRY not set"; \
		exit 1; \
	fi
	@echo "Logging in to Snowflake registry..."
	docker login $(shell echo $(SNOWFLAKE_REGISTRY) | cut -d'/' -f1)

.PHONY: deploy-app
deploy-app: ## Deploy the Native App to Snowflake (requires snowsql)
	@echo "Deploying Native App to Snowflake..."
	@if ! command -v snowsql >/dev/null 2>&1; then \
		echo "Error: snowsql not found. Please install Snowflake CLI."; \
		exit 1; \
	fi
	snowsql -f scripts/deploy.sql

# Monitoring targets
.PHONY: logs
logs: ## View application logs (requires running containers)
	docker-compose logs -f

.PHONY: status
status: ## Check application status
	@echo "Checking application status..."
	@curl -s http://localhost:8000/health || echo "Application not running"
	@curl -s http://localhost:8081/health || echo "Backend not running"

# Database targets
.PHONY: db-reset
db-reset: ## Reset application database (development only)
	@echo "Resetting application database..."
	@echo "WARNING: This will delete all application data!"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ]
	snowsql -c dev -q "DROP APPLICATION IF EXISTS snowsarva;"
	snowsql -c dev -f app/setup.sql

# Backup targets
.PHONY: backup-config
backup-config: ## Backup application configuration
	@echo "Backing up application configuration..."
	@mkdir -p backups
	snowsql -c prod -q "SELECT * FROM snowsarva.config.app_config;" -o output_format=json > backups/config_$(shell date +%Y%m%d_%H%M%S).json