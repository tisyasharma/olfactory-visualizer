# Olfactory Data Visualizer - Frontend

React + TypeScript frontend for the Olfactory Data Visualizer dashboard.

## Tech Stack

- **React 19** with TypeScript
- **Vite** for build tooling and dev server
- **D3.js** for data visualizations
- **React Router** for navigation
- **@hms-dbmi/viv** for OME-Zarr microscopy viewer

## Development

```bash
# Install dependencies
npm install

# Start dev server (runs on http://localhost:5173 by default)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Key Dependencies

- **@hms-dbmi/viv** (^0.15.0): OME-Zarr microscopy viewer
  - Used by `src/pages/Napari.tsx` (Microscopy Viewer)
  - Implementation: `src/components/viewer/OmeZarrSliceViewer.tsx`

- **d3** (^7.9.0): Data visualizations
  - Scatter plots, bar charts, dot plots
  - Zoom/pan interactions

## Project Structure

```
src/
├── api/              # API client and endpoints
├── components/       # React components
│   ├── controls/     # UI controls (selectors, zoom, etc.)
│   ├── layout/       # Layout components (sidebar, navigation)
│   ├── shared/       # Shared components (tooltip, spinner)
│   ├── viewer/       # OME-Zarr microscopy viewer
│   └── visualizations/ # D3.js charts
├── pages/            # Route pages
├── hooks/            # Custom React hooks
├── types/            # TypeScript type definitions
└── utils/            # Utility functions
```

## API Integration

The frontend connects to the FastAPI backend at `/api/v1`. See `src/api/` for endpoint definitions and client utilities.

## See Also

- Main project README: `../../README.md`
- Backend API: `../../api/`
