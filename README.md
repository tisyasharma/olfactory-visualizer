# Olfactory Data Visualizer

Interactive dashboard for exploring mouse olfactory circuit connectivity data from the Murthy Lab at Harvard University.

## What it does

- Visualizes dual-viral tracing and rabies tracing experiments
- Displays brain region connectivity patterns across genotypes (Vglut1 vs Vgat)
- Provides a web-native OME-Zarr microscopy viewer
- Supports data upload and ETL pipeline for new experiments

## Tech Stack

- **Backend:** FastAPI + PostgreSQL
- **Frontend:** React + TypeScript + Vite + D3.js
- **Data:** OME-Zarr for microscopy, BIDS-compliant file organization

## Quick Start

### Option 1: Automated Setup (Recommended)

```bash
# One-command setup
make setup

# Start development servers
make dev
```

### Option 2: Manual Setup

See [SETUP.md](./SETUP.md) for detailed step-by-step instructions.

### Prerequisites

- Python 3.9+
- Node.js 18+
- PostgreSQL 15+ (or use Docker Compose)
- Make (optional, for convenience commands)

### Quick Commands

```bash
make install      # Install all dependencies
make setup        # Full setup
make dev          # Start both servers
make backend      # Start backend only
make frontend     # Start frontend only
make etl          # Run ETL pipeline
make test         # Run tests
```

See `make help` for all available commands.

## Project Structure

```
code/
├── api/           # FastAPI routes and services
├── database/      # ETL pipeline and DB utilities
└── web-react/     # React frontend
```

## Tests

```bash
pytest
```
