.PHONY: help install setup dev backend frontend test clean db-init db-reset etl diagnose

# Default target
help:
	@echo "Olfactory Data Visualizer - Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make install     - Install all dependencies (backend + frontend)"
	@echo "  make setup       - Full setup: install deps, init DB, run ETL"
	@echo "  make db-init     - Initialize database schema"
	@echo "  make db-reset    - Reset database (drop, create, init)"
	@echo "  make etl         - Run ETL pipeline to load data"
	@echo ""
	@echo "Development:"
	@echo "  make dev         - Start both backend and frontend (requires 2 terminals)"
	@echo "  make backend     - Start backend server only"
	@echo "  make frontend    - Start frontend dev server only"
	@echo ""
	@echo "Testing:"
	@echo "  make test        - Run tests"
	@echo ""
	@echo "Utilities:"
	@echo "  make clean       - Clean Python cache and build artifacts"
	@echo "  make regenerate-zarr - Regenerate OME-Zarr files as multiscale"
	@echo "  make diagnose    - Run database diagnostics"

# Installation
install:
	@echo "Installing backend dependencies..."
	pip install -e ".[dev]"
	@echo "Installing frontend dependencies..."
	cd code/web-react && npm install
	@echo "Installation complete!"

# Full setup
setup: install db-init etl
	@echo "Setup complete! Run 'make dev' to start development servers."

# Database operations
db-init:
	@echo "Initializing database..."
	@psql -lqt | cut -d \| -f 1 | grep -qw murthy_db || createdb murthy_db
	psql murthy_db < code/database/schema.sql
	@echo "Database initialized!"

db-reset:
	@echo "Resetting database..."
	-dropdb murthy_db
	createdb murthy_db
	psql murthy_db < code/database/schema.sql
	@echo "Database reset!"

# ETL
etl:
	@echo "Running ETL pipeline..."
	python -m code.database.etl.runner
	@echo "ETL complete!"

# Development servers
# Backend API runs on port 8000
# Frontend dev server runs on port 5173 (Vite default)
BACKEND_PORT = 8000
FRONTEND_PORT = 5173

dev:
	@echo "Starting development servers..."
	@echo "Backend API: http://localhost:$(BACKEND_PORT)"
	@echo "Frontend: http://localhost:$(FRONTEND_PORT)"
	@echo ""
	@echo "Press Ctrl+C to stop"
	@echo ""
	@trap 'kill 0' EXIT; \
	uvicorn code.api.main:app --reload --port $(BACKEND_PORT) & \
	cd code/web-react && npm run dev

backend:
	@echo "Starting backend server..."
	@echo "API: http://localhost:$(BACKEND_PORT)"
	@echo "Docs: http://localhost:$(BACKEND_PORT)/docs"
	uvicorn code.api.main:app --reload --port $(BACKEND_PORT)

frontend:
	@echo "Starting frontend dev server..."
	@echo "Frontend: http://localhost:$(FRONTEND_PORT)"
	cd code/web-react && npm run dev

# Testing
test:
	@echo "Running tests..."
	pytest

# Cleanup
clean:
	@echo "Cleaning up..."
	find . -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	rm -rf *.egg-info
	rm -rf code/web-react/dist
	@echo "Clean complete!"

# Regenerate OME-Zarr files
regenerate-zarr:
	@echo "Regenerating OME-Zarr files as multiscale..."
	python -m code.database.etl.convert_to_zarr
	@echo "Re-registering files in database..."
	python -m code.database.etl.runner
	@echo "OME-Zarr files regenerated!"

# Database diagnostics
diagnose:
	@echo "Running database diagnostics..."
	python scripts/diagnose_db.py

