# Local Development Setup Guide

Complete step-by-step guide to get the Olfactory Data Visualizer running locally.

## Quick Start

For the fastest setup, use the Makefile:

```bash
# One-command setup (installs deps, sets up DB, runs ETL)
make setup

# Start development servers
make dev
```

For Docker-based setup:

```bash
# Start PostgreSQL in Docker
docker-compose up -d postgres

# Then run setup
make setup
```

## Prerequisites Check

You have:
- Python 3.12.7
- Node.js v25.2.1
- PostgreSQL 17.7

## Step 1: Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` if you need to change database credentials or other settings.

## Step 2: Install Dependencies

### Option A: Using Makefile (Recommended)

```bash
make install
```

### Option B: Manual Installation

```bash
# Backend
pip install -e ".[dev]"

# Frontend
cd code/web-react && npm install && cd ../..
```

## Step 3: Database Setup

### Option A: Using Docker Compose (Recommended for Consistency)

```bash
# Start PostgreSQL in Docker
docker-compose up -d postgres

# Wait for database to be ready (takes ~5 seconds)
sleep 5

# Initialize schema
make db-init
```

### Option B: Local PostgreSQL

```bash
# Create database
createdb murthy_db

# Initialize schema
make db-init
# OR manually: psql murthy_db < code/database/schema.sql
```

### Step 3b: Run ETL Pipeline (Load Data)

```bash
make etl
# OR manually: python -m code.database.etl.runner
```

This will:
- Load brain region data
- Scan and register OME-Zarr microscopy files
- Load quantification data
- Register subjects and sessions

## Step 4: Start Development Servers

### Option A: Start Both Servers (Recommended)

```bash
make dev
```

This starts both backend and frontend in the same terminal (uses background processes).

### Option B: Start Separately (Two Terminals)

**Terminal 1 - Backend (port 8000):**
```bash
make backend
# OR: uvicorn code.api.main:app --reload --port 8000
```

**Terminal 2 - Frontend (port 5173):**
```bash
make frontend
# OR: cd code/web-react && npm run dev
```

### URLs

The application uses the following default ports:
- **Frontend**: http://localhost:5173 (Vite dev server)
- **Backend API**: http://localhost:8000 (FastAPI)
- **API Docs**: http://localhost:8000/docs (Swagger UI)
- **API Health**: http://localhost:8000/api/v1/status

## Step 6: Verify Everything Works

1. **Backend**: Visit http://localhost:8000/docs - you should see the FastAPI Swagger UI
2. **Frontend**: Visit http://localhost:5173 - you should see the dashboard
3. **API Status**: Visit http://localhost:8000/api/v1/status - should return counts

## Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
pg_isready

# Check if database exists
psql -l | grep murthy_db

# Test connection
psql murthy_db -c "SELECT version();"
```

### Port Already in Use

If the default ports are already in use:
- **Backend (8000)**: Change via `API_PORT` environment variable or `--port` flag
- **Frontend (5173)**: Change via `VITE_PORT` environment variable or `--port` flag

```bash
# Backend: use different port
uvicorn code.api.main:app --reload --port 8001

# Frontend: use different port
npm run dev -- --port 5174
```

### Missing Dependencies

```bash
# Reinstall backend
pip install -e ".[dev]" --force-reinstall

# Reinstall frontend
cd code/web-react
rm -rf node_modules package-lock.json
npm install
```

### CORS Issues

If you see CORS errors, make sure:
- Backend API is running on port 8000
- Frontend dev server is running on port 5173
- Both are in the CORS allow list (see `code/api/main.py`)
- If using custom ports, update CORS settings in `code/api/main.py`

## Development Workflow

### Daily Development

```bash
# Start everything
make dev

# Or separately
make backend   # Terminal 1
make frontend  # Terminal 2
```

### Common Tasks

```bash
make help           # Show all available commands
make test           # Run tests
make clean          # Clean build artifacts
make db-reset       # Reset database (careful!)
make regenerate-zarr # Regenerate OME-Zarr files
```

### Using Docker for Database

```bash
# Start PostgreSQL
docker-compose up -d postgres

# Stop PostgreSQL
docker-compose down

# View logs
docker-compose logs -f postgres
```

## Next Steps After Setup

1. **Load Sample Data**: Run the ETL pipeline if you haven't already
2. **Test Upload**: Try uploading microscopy files via the Upload page
3. **Explore Visualizations**: Check out Dual Injection and Rabies Tracing pages
4. **View Microscopy**: Use the Microscopy Viewer to browse OME-Zarr stacks

## Regenerating OME-Zarr Files (Multiscale Support)

If you have existing single-scale OME-Zarr files and want to convert them to multiscale format:

### Option 1: Regenerate from Source PNGs

```bash
# Convert all subjects from PNG slices to multiscale OME-Zarr
python -m code.database.etl.convert_to_zarr

# Then re-run ETL to register the new files
python -m code.database.etl.runner
```

### Option 2: Delete and Regenerate

```bash
# Delete existing single-scale files (optional - they'll be overwritten anyway)
rm -rf data/raw_bids/sub-*/ses-*/micr/*.zarr

# Regenerate as multiscale
python -m code.database.etl.convert_to_zarr

# Re-run ETL to register
python -m code.database.etl.runner
```

**Note**: The `convert_to_zarr.py` script automatically cleans up old files before writing new ones, so Option 1 is usually sufficient.

